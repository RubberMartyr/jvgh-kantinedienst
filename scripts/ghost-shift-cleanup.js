#!/usr/bin/env node
"use strict";

const fs = require("node:fs/promises");
const { dryRun, deleteReportedGhostShifts } = require("../shared/ghost-shifts.js");

const args = process.argv.slice(2);
const valueAfter = (flag) => { const i = args.indexOf(flag); return i < 0 ? "" : args[i + 1]; };
const month = valueAfter("--month");
const reportPath = valueAfter("--report");
const apply = args.includes("--apply");
if (!/^\d{4}-\d{2}$/.test(month) || !reportPath) {
  console.error("Gebruik: node scripts/ghost-shift-cleanup.js --month YYYY-MM --report rapport.json [--apply]");
  process.exit(2);
}

const base = String(process.env.JVGH_API_BASE || "https://jeugdherk.be/wp-json/jvgh/v1").replace(/\/$/, "");
const auth = process.env.JVGH_USERNAME && process.env.JVGH_APP_PASSWORD
  ? `Basic ${Buffer.from(`${process.env.JVGH_USERNAME}:${process.env.JVGH_APP_PASSWORD}`).toString("base64")}` : "";
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { Accept: "application/json", ...(auth ? { Authorization: auth } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: HTTP ${response.status} ${JSON.stringify(data)}`);
  return data;
}
const getSignups = (id) => request(`/tasks/${id}/signups`);
const deleteTask = (scheduleId, id) => request(`/schedules/${scheduleId}/tasks/${id}`, { method: "DELETE" });

function flattenTasks(payload) {
  const schedules = Array.isArray(payload?.schedules) ? payload.schedules : [];
  return schedules.flatMap((schedule) => (schedule.tasks || []).map((task) => ({ ...task, sheetId: task.sheetId ?? schedule.id })));
}

(async () => {
  const payload = await request(`/planner-month-data?month=${encodeURIComponent(month)}`);
  const tasks = flattenTasks(payload);
  if (!apply) {
    const report = await dryRun({ tasks, getSignups });
    const document = { generatedAt: new Date().toISOString(), month, mode: "dry-run", ghosts: report };
    await fs.writeFile(reportPath, `${JSON.stringify(document, null, 2)}\n`, { flag: "wx" });
    console.table(report.map(({ taskId, date, time, title, signupCount, reason }) => ({ taskId, date, time, title, signupCount, reason })));
    console.log(`Dry-run: ${report.length} ghost shift(s). Rapport opgeslagen in ${reportPath}; er is niets verwijderd.`);
    return;
  }
  const document = JSON.parse(await fs.readFile(reportPath, "utf8"));
  if (document.mode !== "dry-run" || document.month !== month || !Array.isArray(document.ghosts)) throw new Error("Ongeldig of niet-passend dry-runrapport.");
  const deleted = await deleteReportedGhostShifts({ report: document.ghosts, tasks, getSignups, deleteTask });
  console.table(deleted.map(({ taskId, date, time, title }) => ({ taskId, date, time, title })));
  console.log(`${deleted.length} opnieuw gecontroleerde, uitsluitend eerder gerapporteerde ghost shift(s) verwijderd.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
