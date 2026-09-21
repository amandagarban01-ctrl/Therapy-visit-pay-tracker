(function () {
  "use strict";

  var VISITS_KEY = "vpt_visits_v1";
  var PAYCHECKS_KEY = "vpt_paychecks_v1";
  var AGENCIES_KEY = "vpt_agencies_v2";

  var VISIT_TYPES = ["PT Evaluation", "PT Visit", "Reassessment", "Discharge Discipline", "Discharge OASIS", "Recertification", "OASIS"];

  var SCHEDULE_LABELS = {
    weekly: "Weekly",
    biweekly: "Biweekly (every 2 weeks)",
    semimonthly: "Semi-monthly (1st–15th / 16th–end)",
    monthly: "Monthly (calendar month)"
  };

  function loadVisits() { try { return JSON.parse(localStorage.getItem(VISITS_KEY) || "[]"); } catch (e) { return []; } }
  function saveVisits(v) { localStorage.setItem(VISITS_KEY, JSON.stringify(v)); }
  function loadPaychecks() { try { return JSON.parse(localStorage.getItem(PAYCHECKS_KEY) || "[]"); } catch (e) { return []; } }
  function savePaychecks(p) { localStorage.setItem(PAYCHECKS_KEY, JSON.stringify(p)); }
  function loadAgencies() { try { return JSON.parse(localStorage.getItem(AGENCIES_KEY) || "[]"); } catch (e) { return []; } }
  function saveAgencies() { localStorage.setItem(AGENCIES_KEY, JSON.stringify(agencies)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  var visits = loadVisits();
  var paychecks = loadPaychecks();
  var agencies = loadAgencies();

  var storageMode = "local";
  var dbApi = null;
  var assetsApi = null;

  var storageStatusEl = document.getElementById("storage-status");
  function setStorageStatus(text, warn) {
    if (!text) { storageStatusEl.hidden = true; return; }
    storageStatusEl.textContent = text;
    storageStatusEl.className = warn ? "hint hint-warn" : "hint";
    storageStatusEl.hidden = false;
  }

  function docToRecord(doc) {
    var data = doc.data() || {};
    data.id = doc.id;
    return data;
  }

  function pushToDb(collectionName, record) {
    if (storageMode !== "db" || !dbApi) return;
    dbApi.collection(collectionName).doc(record.id).set(record).catch(function (err) {
      showDataMessage("Couldn't sync to cloud storage: " + (err && err.message ? err.message : "unknown error"));
    });
  }

  function deleteFromDb(collectionName, id) {
    if (storageMode !== "db" || !dbApi) return;
    dbApi.collection(collectionName).doc(id).delete().catch(function (err) {
      showDataMessage("Couldn't sync deletion to cloud storage: " + (err && err.message ? err.message : "unknown error"));
    });
  }

  function formatMoney(n) {
    var v = Number(n); if (isNaN(v)) v = 0;
    return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
  }

  function visitTotal(v) {
    return (Number(v.amount) || 0) + (Number(v.travelPay) || 0) + (Number(v.extraPay) || 0);
  }

  function formatDate(iso) {
    if (!iso) return "—";
    var parts = iso.split("-");
    if (parts.length !== 3) return iso;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // ---------- custom confirm dialog (native confirm() can be silently blocked in a sandboxed iframe) ----------

  var confirmOverlay = document.getElementById("confirm-overlay");
  var confirmMessageEl = document.getElementById("confirm-message");
  var confirmOkBtn = document.getElementById("confirm-ok-btn");
  var confirmCancelBtn = document.getElementById("confirm-cancel-btn");
  var confirmResolver = null;

  function showConfirm(message, okLabel) {
    confirmMessageEl.textContent = message;
    confirmOkBtn.textContent = okLabel || "Delete";
    confirmOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    window.setTimeout(function () { confirmCancelBtn.focus(); }, 0);
    return new Promise(function (resolve) { confirmResolver = resolve; });
  }

  function closeConfirm(result) {
    confirmOverlay.hidden = true;
    document.body.style.overflow = "";
    var resolve = confirmResolver;
    confirmResolver = null;
    if (resolve) resolve(result);
  }

  confirmOkBtn.addEventListener("click", function () { closeConfirm(true); });
  confirmCancelBtn.addEventListener("click", function () { closeConfirm(false); });
  confirmOverlay.addEventListener("click", function (e) { if (e.target === confirmOverlay) closeConfirm(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !confirmOverlay.hidden) closeConfirm(false); });

  // ---------- pay-period math ----------

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function toIso(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function parseIso(iso) { var p = iso.split("-"); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

  function periodForDate(agency, dateIso) {
    var d = parseIso(dateIso);
    var sched = (agency && agency.schedule) || { type: "monthly" };
    if (sched.type === "monthly") {
      return { start: toIso(new Date(d.getFullYear(), d.getMonth(), 1)), end: toIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
    }
    if (sched.type === "semimonthly") {
      if (d.getDate() <= 15) {
        return { start: toIso(new Date(d.getFullYear(), d.getMonth(), 1)), end: toIso(new Date(d.getFullYear(), d.getMonth(), 15)) };
      }
      return { start: toIso(new Date(d.getFullYear(), d.getMonth(), 16)), end: toIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
    }
    var anchor = sched.anchor ? parseIso(sched.anchor) : d;
    var len = sched.type === "weekly" ? 7 : 14;
    var diffDays = Math.floor((d - anchor) / 86400000);
    var periodIndex = Math.floor(diffDays / len);
    var start = addDays(anchor, periodIndex * len);
    var end = addDays(start, len - 1);
    return { start: toIso(start), end: toIso(end) };
  }

  function listAgencyPeriods(agency, monthsBack, monthsForward) {
    var results = [];
    var seen = {};
    var cursor = new Date(); cursor.setDate(1); cursor.setMonth(cursor.getMonth() - monthsBack);
    var limit = new Date(); limit.setDate(1); limit.setMonth(limit.getMonth() + monthsForward + 1);
    while (cursor < limit) {
      var p = periodForDate(agency, toIso(cursor));
      var key = p.start + "|" + p.end;
      if (!seen[key]) { seen[key] = true; results.push(p); }
      cursor = addDays(cursor, 1);
    }
    results.sort(function (a, b) { return b.start.localeCompare(a.start); });
    return results;
  }

  function formatPeriodLabel(period) {
    var s = parseIso(period.start), e = parseIso(period.end);
    if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
      return s.toLocaleDateString(undefined, { month: "short" }) + " " + s.getDate() + "–" + e.getDate() + ", " + e.getFullYear();
    }
    return formatDate(period.start) + " – " + formatDate(period.end);
  }

  // ---------- agencies ----------

  function agencyById(id) { return agencies.find(function (a) { return a.id === id; }); }
  function agencyName(id) { var a = agencyById(id); return a ? a.name : "(deleted agency)"; }

  function migrateLegacyData() {
    var changed = false;
    var agencyByName = {};
    agencies.forEach(function (a) { agencyByName[a.name.trim().toLowerCase()] = a.id; });

    function ensureAgencyFor(name) {
      var key = name.trim().toLowerCase();
      if (agencyByName[key]) return agencyByName[key];
      var a = { id: uid(), name: name.trim(), schedule: { type: "monthly" }, rates: {} };
      agencies.push(a);
      agencyByName[key] = a.id;
      changed = true;
      return a.id;
    }

    visits.forEach(function (v) {
      if (!v.agencyId && v.company) { v.agencyId = ensureAgencyFor(v.company); changed = true; }
    });
    paychecks.forEach(function (p) {
      if (!p.agencyId && p.company) { p.agencyId = ensureAgencyFor(p.company); changed = true; }
    });

    if (changed) { saveAgencies(); saveVisits(); savePaychecks(); }
  }

  function populateAgencySelects() {
    var sorted = agencies.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    document.querySelectorAll(".agency-select").forEach(function (sel) {
      var prev = sel.value;
      var mode = sel.dataset.mode;
      sel.innerHTML = "";
      var first = document.createElement("option");
      first.value = "";
      first.textContent = mode === "all" ? "All agencies" : "Select agency…";
      sel.appendChild(first);
      sorted.forEach(function (a) {
        var opt = document.createElement("option");
        opt.value = a.id; opt.textContent = a.name;
        sel.appendChild(opt);
      });
      if (prev && sorted.some(function (a) { return a.id === prev; })) sel.value = prev;
    });
  }

  var agencyForm = document.getElementById("agency-form");
  var agencyIdField = document.getElementById("agency-id");
  var agencyNameField = document.getElementById("agency-name");
  var agencyScheduleType = document.getElementById("agency-schedule-type");
  var agencyAnchorWrap = document.getElementById("agency-anchor-wrap");
  var agencyAnchor = document.getElementById("agency-anchor");
  var agencyRateGrid = document.getElementById("agency-rate-grid");
  var agencySubmitBtn = document.getElementById("agency-submit-btn");
  var agencyCancelBtn = document.getElementById("agency-cancel-btn");
  var agencyFormHeading = document.getElementById("agency-form-heading");

  function buildRateGrid(rates) {
    agencyRateGrid.innerHTML = "";
    VISIT_TYPES.forEach(function (type, i) {
      var label = document.createElement("label");
      label.innerHTML = escapeHtml(type) + ' <span class="optional">($ per visit)</span>';
      var input = document.createElement("input");
      input.type = "number"; input.step = "0.01"; input.min = "0"; input.placeholder = "0.00";
      input.id = "agency-rate-" + i;
      input.value = (rates && rates[type]) ? rates[type] : "";
      label.appendChild(input);
      agencyRateGrid.appendChild(label);
    });
  }

  function readRateGridValues() {
    var rates = {};
    VISIT_TYPES.forEach(function (type, i) {
      var v = parseFloat(document.getElementById("agency-rate-" + i).value);
      if (v > 0) rates[type] = v;
    });
    return rates;
  }

  function toggleAgencyAnchor() {
    var t = agencyScheduleType.value;
    agencyAnchorWrap.hidden = !(t === "weekly" || t === "biweekly");
  }
  agencyScheduleType.addEventListener("change", toggleAgencyAnchor);

  function resetAgencyForm() {
    agencyForm.reset();
    agencyIdField.value = "";
    agencyScheduleType.value = "semimonthly";
    toggleAgencyAnchor();
    buildRateGrid(null);
    agencyFormHeading.textContent = "Add an agency";
    agencySubmitBtn.textContent = "Add agency";
    agencyCancelBtn.hidden = true;
  }

  agencyForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = agencyIdField.value;
    var scheduleType = agencyScheduleType.value;
    var schedule = { type: scheduleType };
    if (scheduleType === "weekly" || scheduleType === "biweekly") {
      schedule.anchor = agencyAnchor.value || todayIso();
    }
    var record = {
      id: id || uid(),
      name: agencyNameField.value.trim(),
      schedule: schedule,
      rates: readRateGridValues(),
      contactEmail: document.getElementById("agency-contact-email").value.trim(),
      contactPhone: document.getElementById("agency-contact-phone").value.trim()
    };
    if (id) {
      var idx = agencies.findIndex(function (a) { return a.id === id; });
      if (idx !== -1) agencies[idx] = record;
    } else { agencies.push(record); }
    saveAgencies();
    pushToDb("agencies", record);
    resetAgencyForm();
    renderAll();
  });

  agencyCancelBtn.addEventListener("click", resetAgencyForm);

  function editAgency(id) {
    var a = agencyById(id);
    if (!a) return;
    agencyIdField.value = a.id;
    agencyNameField.value = a.name;
    agencyScheduleType.value = (a.schedule && a.schedule.type) || "monthly";
    toggleAgencyAnchor();
    agencyAnchor.value = (a.schedule && a.schedule.anchor) || "";
    document.getElementById("agency-contact-email").value = a.contactEmail || "";
    document.getElementById("agency-contact-phone").value = a.contactPhone || "";
    buildRateGrid(a.rates || {});
    agencyFormHeading.textContent = "Edit agency";
    agencySubmitBtn.textContent = "Save changes";
    agencyCancelBtn.hidden = false;
    document.querySelector('.tab-btn[data-tab="agencies"]').click();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteAgency(id) {
    var visitCount = visits.filter(function (v) { return v.agencyId === id; }).length;
    var paycheckCount = paychecks.filter(function (p) { return p.agencyId === id; }).length;
    var msg = "Delete this agency?";
    if (visitCount || paycheckCount) {
      msg += " It has " + visitCount + " visit(s) and " + paycheckCount + " paycheck(s) linked to it — those records are kept, but will show as an unknown agency.";
    }
    showConfirm(msg).then(function (ok) {
      if (!ok) return;
      agencies = agencies.filter(function (a) { return a.id !== id; });
      saveAgencies();
      deleteFromDb("agencies", id);
      renderAll();
    });
  }

  function scheduleSummaryText(agency) {
    var label = SCHEDULE_LABELS[(agency.schedule && agency.schedule.type) || "monthly"];
    var example = periodForDate(agency, todayIso());
    return label + " · e.g. " + formatPeriodLabel(example);
  }

  function rateSummaryText(agency) {
    var parts = VISIT_TYPES.filter(function (t) { return agency.rates && agency.rates[t] > 0; })
      .map(function (t) { return t + " " + formatMoney(agency.rates[t]); });
    return parts.length ? parts.join(" · ") : "No standard rates set — amount entered manually each visit";
  }

  function contactSummaryText(agency) {
    var parts = [];
    if (agency.contactEmail) parts.push(agency.contactEmail);
    if (agency.contactPhone) parts.push(agency.contactPhone);
    return parts.length ? "Payroll contact: " + parts.join(" · ") : "";
  }

  function renderAgencies() {
    var list = document.getElementById("agency-list");
    var sorted = agencies.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    list.innerHTML = "";
    sorted.forEach(function (a) {
      var contact = contactSummaryText(a);
      var row = document.createElement("div");
      row.className = "day-visit-row";
      row.innerHTML =
        '<div class="dv-main"><div class="dv-company">' + escapeHtml(a.name) + "</div>" +
        '<div class="dv-meta">' + escapeHtml(scheduleSummaryText(a)) + "</div>" +
        '<div class="dv-meta">' + escapeHtml(rateSummaryText(a)) + "</div>" +
        (contact ? '<div class="dv-meta">' + escapeHtml(contact) + "</div>" : "") + "</div>" +
        '<div class="row-actions"><button type="button" class="icon-btn" data-agency-edit="' + a.id + '">Edit</button>' +
        '<button type="button" class="icon-btn danger" data-agency-delete="' + a.id + '">Delete</button></div>';
      list.appendChild(row);
    });
    document.getElementById("agencies-empty").hidden = sorted.length !== 0;
    list.querySelectorAll("[data-agency-edit]").forEach(function (btn) { btn.addEventListener("click", function () { editAgency(btn.dataset.agencyEdit); }); });
    list.querySelectorAll("[data-agency-delete]").forEach(function (btn) { btn.addEventListener("click", function () { deleteAgency(btn.dataset.agencyDelete); }); });
  }

  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  // ---------- visit modal (add / edit, opened from the calendar or the table) ----------

  var modalOverlay = document.getElementById("visit-modal-overlay");
  var modalDateLabel = document.getElementById("modal-date-label");
  var modalDayList = document.getElementById("modal-day-list");
  var modalForm = document.getElementById("modal-visit-form");
  var modalFormHeading = document.getElementById("modal-form-heading");
  var mVisitId = document.getElementById("m-visit-id");
  var mVisitAgency = document.getElementById("m-visit-agency");
  var mVisitType = document.getElementById("m-visit-type");
  var mVisitAmount = document.getElementById("m-visit-amount");
  var mVisitSubmitBtn = document.getElementById("m-visit-submit-btn");
  var mVisitCancelEditBtn = document.getElementById("m-visit-cancel-edit-btn");
  var mVisitDeleteBtn = document.getElementById("m-visit-delete-btn");
  var modalOpenDate = null;
  var amountManuallyEdited = false;

  mVisitAmount.addEventListener("input", function () { amountManuallyEdited = true; });

  function maybeAutoFillRate() {
    if (amountManuallyEdited) return;
    var agency = agencyById(mVisitAgency.value);
    var type = mVisitType.value;
    if (agency && type && agency.rates && agency.rates[type] > 0) {
      mVisitAmount.value = agency.rates[type];
    }
  }
  mVisitAgency.addEventListener("change", maybeAutoFillRate);
  mVisitType.addEventListener("change", maybeAutoFillRate);

  function weekdayLong(iso) {
    var parts = iso.split("-");
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  function resetModalForm(dateIso) {
    modalForm.reset();
    mVisitId.value = "";
    document.getElementById("m-visit-date").value = dateIso;
    document.getElementById("m-visit-status").value = "pending";
    amountManuallyEdited = false;
    modalFormHeading.textContent = "Add a visit";
    mVisitSubmitBtn.textContent = "Add visit";
    mVisitCancelEditBtn.hidden = true;
    mVisitDeleteBtn.hidden = true;
  }

  function renderModalDayList(dateIso) {
    var dayVisits = visits.filter(function (v) { return v.date === dateIso; })
      .sort(function (a, b) { return agencyName(a.agencyId).localeCompare(agencyName(b.agencyId)); });
    modalDayList.innerHTML = "";
    if (dayVisits.length === 0) {
      modalDayList.hidden = true;
      return;
    }
    modalDayList.hidden = false;
    dayVisits.forEach(function (v) {
      var row = document.createElement("div");
      row.className = "day-visit-row";
      row.innerHTML =
        '<div class="dv-main"><div class="dv-company">' + escapeHtml(agencyName(v.agencyId)) + "</div>" +
        '<div class="dv-meta">' + escapeHtml(v.visitType || "—") + " · " + escapeHtml(formatMoney(visitTotal(v))) +
        (v.travelPay || v.extraPay ? " <span class=\"optional\">(incl. " + [v.travelPay ? "travel " + escapeHtml(formatMoney(v.travelPay)) : null, v.extraPay ? "extra " + escapeHtml(formatMoney(v.extraPay)) : null].filter(Boolean).join(", ") + ")</span>" : "") +
        "</div></div>" +
        statusBadge(v.status) +
        '<div class="row-actions"><button type="button" class="icon-btn" data-m-edit="' + v.id + '">Edit</button>' +
        '<button type="button" class="icon-btn danger" data-m-delete="' + v.id + '">Delete</button></div>';
      modalDayList.appendChild(row);
    });
    modalDayList.querySelectorAll("[data-m-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () { populateModalForEdit(btn.dataset.mEdit); });
    });
    modalDayList.querySelectorAll("[data-m-delete]").forEach(function (btn) {
      btn.addEventListener("click", function () { deleteVisit(btn.dataset.mDelete, true); });
    });
  }

  function openDayModal(dateIso, editId, prefill) {
    modalOpenDate = dateIso;
    modalDateLabel.textContent = weekdayLong(dateIso);
    renderModalDayList(dateIso);
    if (editId) {
      populateModalForEdit(editId);
    } else {
      resetModalForm(dateIso);
      if (prefill) {
        if (prefill.agencyId) mVisitAgency.value = prefill.agencyId;
        if (prefill.visitType) mVisitType.value = prefill.visitType;
        maybeAutoFillRate();
      }
    }
    modalOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    window.setTimeout(function () { mVisitAgency.focus(); }, 0);
  }

  function closeModal() {
    modalOverlay.hidden = true;
    document.body.style.overflow = "";
    modalOpenDate = null;
  }

  document.getElementById("modal-close-btn").addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", function (e) { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modalOverlay.hidden) closeModal(); });

  function populateModalForEdit(id) {
    var v = visits.find(function (x) { return x.id === id; });
    if (!v) return;
    mVisitId.value = v.id;
    document.getElementById("m-visit-date").value = v.date || "";
    mVisitAgency.value = v.agencyId || "";
    mVisitType.value = v.visitType || "";
    amountManuallyEdited = false;
    mVisitAmount.value = v.amount || "";
    document.getElementById("m-visit-travel").value = v.travelPay || "";
    document.getElementById("m-visit-extra").value = v.extraPay || "";
    document.getElementById("m-visit-pay-date").value = v.payDate || "";
    document.getElementById("m-visit-status").value = v.status || "pending";
    document.getElementById("m-visit-notes").value = v.notes || "";
    modalFormHeading.textContent = "Edit visit";
    mVisitSubmitBtn.textContent = "Save changes";
    mVisitCancelEditBtn.hidden = false;
    mVisitDeleteBtn.hidden = false;
  }

  mVisitCancelEditBtn.addEventListener("click", function () { resetModalForm(modalOpenDate); });

  mVisitDeleteBtn.addEventListener("click", function () {
    var id = mVisitId.value;
    if (!id) return;
    deleteVisit(id, true);
  });

  modalForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = mVisitId.value;
    var record = {
      id: id || uid(),
      date: document.getElementById("m-visit-date").value,
      agencyId: mVisitAgency.value,
      visitType: mVisitType.value,
      amount: parseFloat(mVisitAmount.value) || 0,
      travelPay: parseFloat(document.getElementById("m-visit-travel").value) || 0,
      extraPay: parseFloat(document.getElementById("m-visit-extra").value) || 0,
      payDate: document.getElementById("m-visit-pay-date").value,
      status: document.getElementById("m-visit-status").value,
      notes: document.getElementById("m-visit-notes").value.trim()
    };
    if (id) {
      var idx = visits.findIndex(function (v) { return v.id === id; });
      if (idx !== -1) visits[idx] = record;
    } else { visits.push(record); }
    saveVisits(visits);
    pushToDb("visits", record);
    renderAll();
    var stayDate = record.date;
    resetModalForm(stayDate);
    renderModalDayList(stayDate);
  });

  function editVisit(id) {
    var v = visits.find(function (x) { return x.id === id; });
    if (!v) return;
    document.querySelector('.tab-btn[data-tab="visits"]').click();
    openDayModal(v.date, v.id);
  }

  function deleteVisit(id, keepModalOpen) {
    showConfirm("Delete this visit? This cannot be undone.").then(function (ok) {
      if (!ok) return;
      var wasOpenDate = modalOpenDate;
      visits = visits.filter(function (v) { return v.id !== id; });
      saveVisits(visits);
      deleteFromDb("visits", id);
      renderAll();
      if (keepModalOpen && wasOpenDate) {
        resetModalForm(wasOpenDate);
        renderModalDayList(wasOpenDate);
      }
    });
  }

  // ---------- calendar ----------

  var today = new Date();
  var calView = { year: today.getFullYear(), month: today.getMonth() };

  function isoDate(y, m, d) {
    var mm = String(m + 1).padStart(2, "0");
    var dd = String(d).padStart(2, "0");
    return y + "-" + mm + "-" + dd;
  }

  function todayIso() { return isoDate(today.getFullYear(), today.getMonth(), today.getDate()); }

  function renderCalendar() {
    var label = new Date(calView.year, calView.month, 1)
      .toLocaleDateString(undefined, { month: "long", year: "numeric" });
    document.getElementById("cal-month-label").textContent = label;

    var grid = document.getElementById("cal-grid");
    grid.innerHTML = "";

    var firstOfMonth = new Date(calView.year, calView.month, 1);
    var startOffset = firstOfMonth.getDay();
    var daysInMonth = new Date(calView.year, calView.month + 1, 0).getDate();
    var totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    var gridStart = new Date(calView.year, calView.month, 1 - startOffset);
    var todayStr = todayIso();

    for (var i = 0; i < totalCells; i++) {
      var cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      var cellIso = isoDate(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
      var inMonth = cellDate.getMonth() === calView.month;

      var cell = document.createElement("div");
      cell.className = "cal-cell" + (inMonth ? "" : " outside") + (cellIso === todayStr ? " today" : "");
      cell.dataset.date = cellIso;
      cell.tabIndex = inMonth ? 0 : -1;

      var head = document.createElement("div");
      head.className = "cal-cell-head";
      var num = document.createElement("span");
      num.className = "cal-daynum";
      num.textContent = String(cellDate.getDate());
      head.appendChild(num);

      var dayVisits = inMonth ? visits.filter(function (v) { return v.date === cellIso; }) : [];
      if (dayVisits.length) {
        var total = document.createElement("span");
        total.className = "cal-day-total";
        total.textContent = formatMoney(dayVisits.reduce(function (s, v) { return s + visitTotal(v); }, 0));
        head.appendChild(total);
      }
      cell.appendChild(head);

      var shown = dayVisits.slice(0, 3);
      shown.forEach(function (v) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "cal-chip chip-" + v.status;
        chip.textContent = agencyName(v.agencyId) + " · " + formatMoney(visitTotal(v));
        chip.title = agencyName(v.agencyId) + " — " + (v.visitType || "Unspecified visit type") + " — " + formatMoney(visitTotal(v)) +
          (v.travelPay || v.extraPay ? " (visit " + formatMoney(v.amount) + (v.travelPay ? ", travel " + formatMoney(v.travelPay) : "") + (v.extraPay ? ", extra " + formatMoney(v.extraPay) : "") + ")" : "");
        chip.addEventListener("click", function (e) {
          e.stopPropagation();
          openDayModal(cellIso, v.id);
        });
        cell.appendChild(chip);
      });
      if (dayVisits.length > 3) {
        var more = document.createElement("button");
        more.type = "button";
        more.className = "cal-more";
        more.textContent = "+" + (dayVisits.length - 3) + " more";
        more.addEventListener("click", function (e) { e.stopPropagation(); openDayModal(cellIso); });
        cell.appendChild(more);
      }

      if (inMonth) {
        cell.addEventListener("click", function () { openDayModal(this.dataset.date); });
        cell.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDayModal(this.dataset.date); }
        });
      }

      grid.appendChild(cell);
    }
  }

  document.getElementById("cal-prev").addEventListener("click", function () {
    calView.month -= 1;
    if (calView.month < 0) { calView.month = 11; calView.year -= 1; }
    renderCalendar();
  });
  document.getElementById("cal-next").addEventListener("click", function () {
    calView.month += 1;
    if (calView.month > 11) { calView.month = 0; calView.year += 1; }
    renderCalendar();
  });
  document.getElementById("cal-today-btn").addEventListener("click", function () {
    calView.year = today.getFullYear(); calView.month = today.getMonth();
    renderCalendar();
  });
  document.getElementById("cal-add-btn").addEventListener("click", function () {
    var y = calView.year, m = calView.month;
    var d = (y === today.getFullYear() && m === today.getMonth()) ? today.getDate() : 1;
    openDayModal(isoDate(y, m, d));
  });

  // ---------- voice entry ----------

  function isEmbeddedView() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }

  var VISIT_TYPE_PHRASES = [
    { type: "Discharge Discipline", phrases: ["discharge discipline"] },
    { type: "Discharge OASIS", phrases: ["discharge oasis", "discharge o.a.s.i.s"] },
    { type: "PT Evaluation", phrases: ["pt evaluation", "p.t. evaluation", "physical therapy evaluation", "evaluation"] },
    { type: "Recertification", phrases: ["recertification", "re-certification", "recert"] },
    { type: "Reassessment", phrases: ["reassessment", "re-assessment"] },
    { type: "OASIS", phrases: ["oasis", "o.a.s.i.s"] },
    { type: "PT Visit", phrases: ["pt visit", "p.t. visit", "physical therapy visit", "visit"] }
  ];

  function matchVisitType(text) {
    var lower = text.toLowerCase();
    for (var i = 0; i < VISIT_TYPE_PHRASES.length; i++) {
      var entry = VISIT_TYPE_PHRASES[i];
      for (var j = 0; j < entry.phrases.length; j++) {
        if (lower.indexOf(entry.phrases[j]) !== -1) return entry.type;
      }
    }
    return null;
  }

  function matchAgency(text) {
    var lower = text.toLowerCase();
    var exact = agencies.find(function (a) { return a.name && lower.indexOf(a.name.toLowerCase()) !== -1; });
    if (exact) return exact;
    var words = lower.split(/\s+/).filter(Boolean);
    var best = null, bestScore = 0;
    agencies.forEach(function (a) {
      var aWords = (a.name || "").toLowerCase().split(/\s+/).filter(Boolean);
      if (!aWords.length) return;
      var hits = aWords.filter(function (w) { return words.indexOf(w) !== -1; }).length;
      var score = hits / aWords.length;
      if (score > bestScore) { bestScore = score; best = a; }
    });
    return bestScore >= 0.6 ? best : null;
  }

  var VOICE_WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  var VOICE_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

  function parseSpokenDate(text) {
    var lower = text.toLowerCase();
    var now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (/\btoday\b/.test(lower)) return isoDate(now.getFullYear(), now.getMonth(), now.getDate());
    if (/\btomorrow\b/.test(lower)) {
      var t = new Date(now); t.setDate(t.getDate() + 1);
      return isoDate(t.getFullYear(), t.getMonth(), t.getDate());
    }
    if (/\byesterday\b/.test(lower)) {
      var y = new Date(now); y.setDate(y.getDate() - 1);
      return isoDate(y.getFullYear(), y.getMonth(), y.getDate());
    }
    for (var mi = 0; mi < VOICE_MONTHS.length; mi++) {
      var re = new RegExp("\\b" + VOICE_MONTHS[mi] + "\\s+(\\d{1,2})(st|nd|rd|th)?\\b");
      var m = lower.match(re);
      if (m) {
        var day = parseInt(m[1], 10);
        var year = now.getFullYear();
        var candidate = new Date(year, mi, day);
        if (candidate < now && (now - candidate) > 1000 * 60 * 60 * 24 * 200) candidate = new Date(year + 1, mi, day);
        return isoDate(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
      }
    }
    for (var wi = 0; wi < VOICE_WEEKDAYS.length; wi++) {
      if (lower.indexOf(VOICE_WEEKDAYS[wi]) !== -1) {
        var targetDow = wi;
        var diff = (targetDow - now.getDay() + 7) % 7;
        var isNext = /\bnext\b/.test(lower);
        if (diff === 0 && isNext) diff = 7;
        else if (isNext) diff += 7;
        var d2 = new Date(now); d2.setDate(d2.getDate() + diff);
        return isoDate(d2.getFullYear(), d2.getMonth(), d2.getDate());
      }
    }
    var nthMatch = lower.match(/\bthe\s+(\d{1,2})(st|nd|rd|th)?\b/);
    if (nthMatch) {
      var nthDay = parseInt(nthMatch[1], 10);
      if (nthDay >= 1 && nthDay <= 31) {
        var candidate2 = new Date(now.getFullYear(), now.getMonth(), nthDay);
        if (candidate2 < now && (now - candidate2) > 1000 * 60 * 60 * 24 * 20) {
          candidate2 = new Date(now.getFullYear(), now.getMonth() + 1, nthDay);
        }
        return isoDate(candidate2.getFullYear(), candidate2.getMonth(), candidate2.getDate());
      }
    }
    return null;
  }

  function parseVoiceCommand(transcript) {
    return {
      transcript: transcript,
      agency: matchAgency(transcript),
      visitType: matchVisitType(transcript),
      dateIso: parseSpokenDate(transcript)
    };
  }

  var voiceAddBtn = document.getElementById("voice-add-btn");
  var voiceStatusEl = document.getElementById("voice-status");
  var voiceConfirmOverlay = document.getElementById("voice-confirm-overlay");
  var voiceHeardText = document.getElementById("voice-heard-text");
  var voiceConfirmSummary = document.getElementById("voice-confirm-summary");
  var voiceConfirmAddBtn = document.getElementById("voice-confirm-add-btn");
  var voiceConfirmEditBtn = document.getElementById("voice-confirm-edit-btn");
  var voiceConfirmCancelBtn = document.getElementById("voice-confirm-cancel-btn");
  var voiceConfirmCloseBtn = document.getElementById("voice-confirm-close");

  var SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognizer = null;
  var listening = false;
  var pendingVoiceResult = null;

  function setVoiceStatus(text, isError) {
    if (!text) { voiceStatusEl.hidden = true; voiceStatusEl.textContent = ""; return; }
    voiceStatusEl.textContent = text;
    voiceStatusEl.className = isError ? "hint voice-error" : "hint";
    voiceStatusEl.hidden = false;
  }

  function closeVoiceConfirm() {
    voiceConfirmOverlay.hidden = true;
    document.body.style.overflow = "";
    pendingVoiceResult = null;
  }

  function showVoiceConfirm(result) {
    pendingVoiceResult = result;
    voiceHeardText.textContent = result.transcript;
    var amount = (result.agency.rates && result.agency.rates[result.visitType]) || 0;
    voiceConfirmSummary.innerHTML =
      '<div class="dv-main"><div class="dv-company">' + escapeHtml(result.agency.name) + "</div>" +
      '<div class="dv-meta">' + escapeHtml(result.visitType) + " · " + escapeHtml(weekdayLong(result.dateIso)) + "</div>" +
      '<div class="dv-meta">' + escapeHtml(formatMoney(amount)) + "</div></div>";
    voiceConfirmOverlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  voiceConfirmAddBtn.addEventListener("click", function () {
    if (!pendingVoiceResult) return;
    var r = pendingVoiceResult;
    var amount = (r.agency.rates && r.agency.rates[r.visitType]) || 0;
    var record = {
      id: uid(),
      date: r.dateIso,
      agencyId: r.agency.id,
      visitType: r.visitType,
      amount: amount,
      travelPay: 0,
      extraPay: 0,
      payDate: "",
      status: "pending",
      notes: ""
    };
    visits.push(record);
    saveVisits(visits);
    pushToDb("visits", record);
    renderAll();
    closeVoiceConfirm();
    setVoiceStatus("Added " + r.visitType + " for " + r.agency.name + " on " + weekdayLong(r.dateIso) + ".");
  });

  voiceConfirmEditBtn.addEventListener("click", function () {
    if (!pendingVoiceResult) return;
    var r = pendingVoiceResult;
    closeVoiceConfirm();
    document.querySelector('.tab-btn[data-tab="visits"]').click();
    openDayModal(r.dateIso, null, { agencyId: r.agency.id, visitType: r.visitType });
  });

  voiceConfirmCancelBtn.addEventListener("click", closeVoiceConfirm);
  voiceConfirmCloseBtn.addEventListener("click", closeVoiceConfirm);
  voiceConfirmOverlay.addEventListener("click", function (e) { if (e.target === voiceConfirmOverlay) closeVoiceConfirm(); });

  function openVoiceFallback(result, hasAgency, hasType, hasDate, hasRate) {
    var dateIso = result.dateIso || todayIso();
    document.querySelector('.tab-btn[data-tab="visits"]').click();
    openDayModal(dateIso, null, {
      agencyId: result.agency ? result.agency.id : null,
      visitType: result.visitType
    });
    var missing = [];
    if (!hasAgency) missing.push("agency");
    if (!hasType) missing.push("visit type");
    if (!hasDate) missing.push("date");
    if (hasAgency && hasType && hasDate && !hasRate) {
      setVoiceStatus('Heard "' + result.transcript + '" — that agency has no saved rate for that visit type, so enter the amount below.');
    } else {
      setVoiceStatus('Heard "' + result.transcript + '" — couldn\'t catch the ' + missing.join(" and ") + ". Fill in the rest below.");
    }
  }

  function handleVoiceTranscript(transcript) {
    var result = parseVoiceCommand(transcript);
    var hasAgency = !!result.agency;
    var hasType = !!result.visitType;
    var hasDate = !!result.dateIso;
    var hasRate = hasAgency && hasType && result.agency.rates && result.agency.rates[result.visitType] > 0;
    if (hasAgency && hasType && hasDate && hasRate) {
      setVoiceStatus("");
      showVoiceConfirm(result);
    } else {
      openVoiceFallback(result, hasAgency, hasType, hasDate, hasRate);
    }
  }

  if (SpeechRecognitionCtor) {
    voiceAddBtn.hidden = false;
    recognizer = new SpeechRecognitionCtor();
    recognizer.continuous = false;
    recognizer.interimResults = false;
    recognizer.lang = "en-US";
    recognizer.maxAlternatives = 1;

    recognizer.onstart = function () {
      listening = true;
      voiceAddBtn.classList.add("listening");
      voiceAddBtn.textContent = "🎤 Listening… tap to stop";
      setVoiceStatus('Listening — try "Riverbend Home Health, PT visit, today."');
    };
    recognizer.onresult = function (e) {
      var transcript = e.results[0][0].transcript;
      handleVoiceTranscript(transcript);
    };
    recognizer.onerror = function (e) {
      if (e.error === "no-speech") {
        setVoiceStatus("Didn't catch that — tap the mic and try again.", true);
      } else if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        if (isEmbeddedView()) {
          setVoiceStatus("Microphone access is blocked in this embedded view. Open the app's own link directly in your browser (not inside another app or preview) to use voice entry.", true);
        } else {
          setVoiceStatus("Microphone access was blocked. Check your browser/device settings for this site and try again.", true);
        }
      } else if (e.error === "aborted") {
        setVoiceStatus("");
      } else {
        setVoiceStatus("Voice entry error: " + e.error + ". Please try again.", true);
      }
    };
    recognizer.onend = function () {
      listening = false;
      voiceAddBtn.classList.remove("listening");
      voiceAddBtn.textContent = "🎤 Speak visit";
    };

    voiceAddBtn.addEventListener("click", function () {
      if (listening) {
        recognizer.stop();
        return;
      }
      amountManuallyEdited = false;
      try {
        recognizer.start();
      } catch (err) {
        setVoiceStatus("Couldn't start voice entry. Please try again.", true);
      }
    });
  }

  function statusBadge(status) {
    var label = status.charAt(0).toUpperCase() + status.slice(1);
    return '<span class="badge badge-' + status + '">' + label + "</span>";
  }

  function renderVisits() {
    var tbody = document.getElementById("visits-tbody");
    var agencyFilter = document.getElementById("filter-agency").value;
    var typeFilter = document.getElementById("filter-visit-type").value;
    var statusFilter = document.getElementById("filter-status").value;

    var filtered = visits.filter(function (v) {
      if (agencyFilter && v.agencyId !== agencyFilter) return false;
      if (typeFilter && v.visitType !== typeFilter) return false;
      if (statusFilter && v.status !== statusFilter) return false;
      return true;
    });
    filtered.sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });

    tbody.innerHTML = "";
    filtered.forEach(function (v) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td class=\"num\">" + escapeHtml(formatDate(v.date)) + "</td>" +
        "<td>" + escapeHtml(agencyName(v.agencyId)) + "</td>" +
        "<td>" + escapeHtml(v.visitType || "—") + "</td>" +
        "<td class=\"num\">" + escapeHtml(formatMoney(v.amount)) + "</td>" +
        "<td class=\"num\">" + escapeHtml(v.travelPay ? formatMoney(v.travelPay) : "—") + "</td>" +
        "<td class=\"num\">" + escapeHtml(v.extraPay ? formatMoney(v.extraPay) : "—") + "</td>" +
        "<td class=\"num\">" + escapeHtml(formatMoney(visitTotal(v))) + "</td>" +
        "<td class=\"num\">" + escapeHtml(formatDate(v.payDate)) + "</td>" +
        "<td>" + statusBadge(v.status) + "</td>" +
        "<td>" + escapeHtml(v.notes || "") + "</td>" +
        '<td class="row-actions">' +
        '<button type="button" class="icon-btn" data-edit="' + v.id + '">Edit</button>' +
        '<button type="button" class="icon-btn danger" data-delete="' + v.id + '">Delete</button>' +
        "</td>";
      tbody.appendChild(tr);
    });

    document.getElementById("visits-empty").hidden = filtered.length !== 0;

    var totalExpected = filtered.reduce(function (s, v) { return s + visitTotal(v); }, 0);
    var pendingCount = filtered.filter(function (v) { return v.status === "pending"; }).length;
    document.getElementById("visits-totals").textContent =
      filtered.length + " visit(s) shown · total expected " + formatMoney(totalExpected) +
      " · " + pendingCount + " pending";

    tbody.querySelectorAll("[data-edit]").forEach(function (btn) { btn.addEventListener("click", function () { editVisit(btn.dataset.edit); }); });
    tbody.querySelectorAll("[data-delete]").forEach(function (btn) { btn.addEventListener("click", function () { deleteVisit(btn.dataset.delete); }); });
  }

  document.getElementById("filter-agency").addEventListener("change", renderVisits);
  document.getElementById("filter-visit-type").addEventListener("change", renderVisits);
  document.getElementById("filter-status").addEventListener("change", renderVisits);

  var paycheckForm = document.getElementById("paycheck-form");
  var paycheckIdField = document.getElementById("paycheck-id");
  var paycheckSubmitBtn = document.getElementById("paycheck-submit-btn");
  var paycheckCancelBtn = document.getElementById("paycheck-cancel-btn");
  var paycheckAgencySelect = document.getElementById("paycheck-agency");
  var paycheckPeriodSelect = document.getElementById("paycheck-period");
  var paycheckCustomRange = document.getElementById("paycheck-custom-range");
  var paycheckPeriodStartCustom = document.getElementById("paycheck-period-start-custom");
  var paycheckPeriodEndCustom = document.getElementById("paycheck-period-end-custom");
  var paycheckPaystubWrap = document.getElementById("paycheck-paystub-wrap");
  var paycheckPaystubInput = document.getElementById("paycheck-paystub-input");
  var paycheckPaystubPreview = document.getElementById("paycheck-paystub-preview");
  var paycheckPaystubImg = document.getElementById("paycheck-paystub-img");
  var paycheckPaystubRemoveBtn = document.getElementById("paycheck-paystub-remove-btn");
  var pendingPaystubAssetId = null;
  var pendingPaystubOldAssetId = null;

  function toggleAssetsUi() {
    if (paycheckPaystubWrap) paycheckPaystubWrap.hidden = !assetsApi;
  }

  function showPaystubPreview(assetId) {
    if (!assetId) { paycheckPaystubPreview.hidden = true; return; }
    paycheckPaystubImg.src = "/_blob/" + assetId;
    paycheckPaystubPreview.hidden = false;
  }

  paycheckPaystubInput.addEventListener("change", function (e) {
    var file = e.target.files[0];
    paycheckPaystubInput.value = "";
    if (!file) return;
    if (!assetsApi) { showDataMessage("Photo uploads need cloud storage, which isn't available right now."); return; }
    showDataMessage("Uploading paystub photo…");
    assetsApi.upload(file).then(function (res) {
      if (pendingPaystubAssetId && pendingPaystubAssetId !== res.id) pendingPaystubOldAssetId = pendingPaystubAssetId;
      pendingPaystubAssetId = res.id;
      showPaystubPreview(res.id);
      showDataMessage("Photo attached — save the paycheck to keep it.");
    }).catch(function (err) {
      showDataMessage("Photo upload failed: " + (err && err.message ? err.message : "unknown error"));
    });
  });

  paycheckPaystubRemoveBtn.addEventListener("click", function () {
    if (pendingPaystubAssetId) pendingPaystubOldAssetId = pendingPaystubAssetId;
    pendingPaystubAssetId = null;
    showPaystubPreview(null);
  });

  var paystubLightboxOverlay = document.getElementById("paystub-lightbox-overlay");
  var paystubLightboxImg = document.getElementById("paystub-lightbox-img");
  function openPaystubLightbox(assetId) {
    paystubLightboxImg.src = "/_blob/" + assetId;
    paystubLightboxOverlay.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closePaystubLightbox() {
    paystubLightboxOverlay.hidden = true;
    document.body.style.overflow = "";
  }
  document.getElementById("paystub-lightbox-close").addEventListener("click", closePaystubLightbox);
  paystubLightboxOverlay.addEventListener("click", function (e) { if (e.target === paystubLightboxOverlay) closePaystubLightbox(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !paystubLightboxOverlay.hidden) closePaystubLightbox(); });

  function populatePaycheckPeriods(selectedRange) {
    var agency = agencyById(paycheckAgencySelect.value);
    paycheckPeriodSelect.innerHTML = "";
    if (!agency) {
      var opt0 = document.createElement("option");
      opt0.value = ""; opt0.textContent = "Select an agency first";
      paycheckPeriodSelect.appendChild(opt0);
      paycheckCustomRange.hidden = true;
      return;
    }
    var periods = listAgencyPeriods(agency, 4, 2);
    periods.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.start + "|" + p.end;
      opt.textContent = formatPeriodLabel(p);
      paycheckPeriodSelect.appendChild(opt);
    });
    var customOpt = document.createElement("option");
    customOpt.value = "custom";
    customOpt.textContent = "Custom range…";
    paycheckPeriodSelect.appendChild(customOpt);

    if (selectedRange) {
      var key = selectedRange.start + "|" + selectedRange.end;
      var matched = Array.prototype.some.call(paycheckPeriodSelect.options, function (o) { return o.value === key; });
      if (matched) {
        paycheckPeriodSelect.value = key;
        paycheckCustomRange.hidden = true;
      } else {
        paycheckPeriodSelect.value = "custom";
        paycheckCustomRange.hidden = false;
        paycheckPeriodStartCustom.value = selectedRange.start;
        paycheckPeriodEndCustom.value = selectedRange.end;
      }
    } else {
      paycheckCustomRange.hidden = true;
    }
  }

  paycheckAgencySelect.addEventListener("change", function () { populatePaycheckPeriods(null); });
  paycheckPeriodSelect.addEventListener("change", function () {
    paycheckCustomRange.hidden = paycheckPeriodSelect.value !== "custom";
  });

  function resetPaycheckForm() {
    paycheckForm.reset(); paycheckIdField.value = "";
    populatePaycheckPeriods(null);
    pendingPaystubAssetId = null;
    pendingPaystubOldAssetId = null;
    showPaystubPreview(null);
    paycheckSubmitBtn.textContent = "Add paycheck"; paycheckCancelBtn.hidden = true;
  }

  paycheckForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = paycheckIdField.value;
    var periodStart, periodEnd;
    if (paycheckPeriodSelect.value === "custom") {
      periodStart = paycheckPeriodStartCustom.value;
      periodEnd = paycheckPeriodEndCustom.value;
    } else {
      var parts = paycheckPeriodSelect.value.split("|");
      periodStart = parts[0]; periodEnd = parts[1];
    }
    var record = {
      id: id || uid(),
      agencyId: paycheckAgencySelect.value,
      dateReceived: document.getElementById("paycheck-date").value,
      periodStart: periodStart,
      periodEnd: periodEnd,
      amount: parseFloat(document.getElementById("paycheck-amount").value) || 0,
      ref: document.getElementById("paycheck-ref").value.trim(),
      notes: document.getElementById("paycheck-notes").value.trim(),
      paystubAssetId: pendingPaystubAssetId || null
    };
    if (id) {
      var idx = paychecks.findIndex(function (p) { return p.id === id; });
      if (idx !== -1) paychecks[idx] = record;
    } else { paychecks.push(record); }
    savePaychecks(paychecks);
    pushToDb("paychecks", record);
    if (pendingPaystubOldAssetId && assetsApi) {
      assetsApi.delete(pendingPaystubOldAssetId).catch(function () {});
    }
    resetPaycheckForm();
    renderPaychecks(); renderSummary(); renderExpectedByPeriod(); renderShareTab();
  });

  paycheckCancelBtn.addEventListener("click", resetPaycheckForm);

  function editPaycheck(id) {
    var p = paychecks.find(function (x) { return x.id === id; });
    if (!p) return;
    paycheckIdField.value = p.id;
    paycheckAgencySelect.value = p.agencyId || "";
    populatePaycheckPeriods({ start: p.periodStart, end: p.periodEnd });
    document.getElementById("paycheck-date").value = p.dateReceived || "";
    document.getElementById("paycheck-amount").value = p.amount || "";
    document.getElementById("paycheck-ref").value = p.ref || "";
    document.getElementById("paycheck-notes").value = p.notes || "";
    pendingPaystubAssetId = p.paystubAssetId || null;
    pendingPaystubOldAssetId = null;
    showPaystubPreview(pendingPaystubAssetId);
    paycheckSubmitBtn.textContent = "Save changes"; paycheckCancelBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deletePaycheck(id) {
    showConfirm("Delete this paycheck record? This cannot be undone.").then(function (ok) {
      if (!ok) return;
      var p = paychecks.find(function (x) { return x.id === id; });
      paychecks = paychecks.filter(function (x) { return x.id !== id; });
      savePaychecks(paychecks);
      deleteFromDb("paychecks", id);
      if (p && p.paystubAssetId && assetsApi) assetsApi.delete(p.paystubAssetId).catch(function () {});
      renderPaychecks(); renderSummary(); renderExpectedByPeriod(); renderShareTab();
    });
  }

  function expectedForPaycheck(p) {
    return visits.filter(function (v) {
      if (v.agencyId !== p.agencyId) return false;
      if (!v.date) return false;
      if (p.periodStart && v.date < p.periodStart) return false;
      if (p.periodEnd && v.date > p.periodEnd) return false;
      return true;
    }).reduce(function (s, v) { return s + visitTotal(v); }, 0);
  }

  function renderPaychecks() {
    var tbody = document.getElementById("paychecks-tbody");
    var sorted = paychecks.slice().sort(function (a, b) { return (b.dateReceived || "").localeCompare(a.dateReceived || ""); });

    tbody.innerHTML = "";
    sorted.forEach(function (p) {
      var expected = expectedForPaycheck(p);
      var actual = Number(p.amount) || 0;
      var diff = actual - expected;
      var diffClass = Math.abs(diff) < 0.005 ? "diff-ok" : "diff-bad";
      var diffLabel = (diff > 0 ? "+" : "") + formatMoney(diff);

      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td class=\"num\">" + escapeHtml(formatDate(p.dateReceived)) + "</td>" +
        "<td>" + escapeHtml(agencyName(p.agencyId)) + "</td>" +
        "<td class=\"num\">" + escapeHtml(formatDate(p.periodStart)) + " – " + escapeHtml(formatDate(p.periodEnd)) + "</td>" +
        "<td class=\"num\">" + escapeHtml(formatMoney(expected)) + "</td>" +
        "<td class=\"num\">" + escapeHtml(formatMoney(actual)) + "</td>" +
        '<td class="num ' + diffClass + '">' + escapeHtml(diffLabel) + "</td>" +
        "<td>" + escapeHtml(p.ref || "—") + "</td>" +
        "<td>" + (p.paystubAssetId ?
          '<button type="button" class="paystub-thumb-btn" data-view-paystub="' + p.paystubAssetId + '"><img src="/_blob/' + p.paystubAssetId + '" alt="Paystub" /></button>' :
          "—") + "</td>" +
        '<td class="row-actions">' +
        '<button type="button" class="icon-btn" data-edit-pc="' + p.id + '">Edit</button>' +
        '<button type="button" class="icon-btn danger" data-delete-pc="' + p.id + '">Delete</button>' +
        "</td>";
      tbody.appendChild(tr);
    });

    document.getElementById("paychecks-empty").hidden = sorted.length !== 0;

    tbody.querySelectorAll("[data-view-paystub]").forEach(function (btn) {
      btn.addEventListener("click", function () { openPaystubLightbox(btn.dataset.viewPaystub); });
    });

    tbody.querySelectorAll("[data-edit-pc]").forEach(function (btn) { btn.addEventListener("click", function () { editPaycheck(btn.dataset.editPc); }); });
    tbody.querySelectorAll("[data-delete-pc]").forEach(function (btn) { btn.addEventListener("click", function () { deletePaycheck(btn.dataset.deletePc); }); });
  }

  function buildPeriodGroups() {
    var groups = {};
    visits.forEach(function (v) {
      if (!v.agencyId || !v.date) return;
      var agency = agencyById(v.agencyId);
      if (!agency) return;
      var period = periodForDate(agency, v.date);
      var key = v.agencyId + "|" + period.start + "|" + period.end;
      if (!groups[key]) groups[key] = { agencyId: v.agencyId, period: period, visits: [], expected: 0 };
      groups[key].visits.push(v);
      groups[key].expected += visitTotal(v);
    });

    var rows = Object.keys(groups).map(function (k) { return groups[k]; });
    rows.forEach(function (g) {
      var matching = paychecks.filter(function (p) {
        return p.agencyId === g.agencyId && p.periodStart === g.period.start && p.periodEnd === g.period.end;
      });
      g.received = matching.reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);
      g.hasPaycheck = matching.length > 0;
    });
    return rows;
  }

  function sortPeriodGroups(rows) {
    rows.sort(function (a, b) {
      var an = agencyName(a.agencyId), bn = agencyName(b.agencyId);
      if (an !== bn) return an.localeCompare(bn);
      return b.period.start.localeCompare(a.period.start);
    });
    return rows;
  }

  function renderExpectedByPeriod() {
    var tbody = document.getElementById("expected-period-tbody");
    var rows = sortPeriodGroups(buildPeriodGroups());

    tbody.innerHTML = "";
    rows.forEach(function (g) {
      var diff = g.received - g.expected;
      var statusHtml;
      if (!g.hasPaycheck) {
        statusHtml = '<span class="badge badge-neutral">Not yet received</span>';
      } else if (Math.abs(diff) < 0.005) {
        statusHtml = '<span class="badge badge-paid">Paid in full</span>';
      } else if (diff < 0) {
        statusHtml = '<span class="badge badge-disputed">Short ' + escapeHtml(formatMoney(Math.abs(diff))) + '</span>';
      } else {
        statusHtml = '<span class="badge badge-pending">Over ' + escapeHtml(formatMoney(diff)) + '</span>';
      }
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(agencyName(g.agencyId)) + "</td>" +
        "<td class=\"num\">" + escapeHtml(formatPeriodLabel(g.period)) + "</td>" +
        "<td class=\"num\">" + g.visits.length + "</td>" +
        "<td class=\"num\">" + escapeHtml(formatMoney(g.expected)) + "</td>" +
        "<td class=\"num\">" + escapeHtml(formatMoney(g.received)) + "</td>" +
        "<td>" + statusHtml + "</td>";
      tbody.appendChild(tr);
    });
    document.getElementById("expected-period-empty").hidden = rows.length !== 0;
  }

  // ---------- share disputes ----------

  var currentDisputeGroups = {};
  var shareMessageEl = document.getElementById("share-message");

  function showShareMessage(msg) {
    shareMessageEl.textContent = msg;
    setTimeout(function () { if (shareMessageEl.textContent === msg) shareMessageEl.textContent = ""; }, 6000);
  }

  function buildDisputeMessage(group) {
    var diff = group.received - group.expected;
    var lines = [];
    lines.push("Pay discrepancy — " + agencyName(group.agencyId));
    lines.push("Pay period: " + formatPeriodLabel(group.period));
    lines.push("Expected: " + formatMoney(group.expected));
    lines.push("Received: " + formatMoney(group.received));
    lines.push("Difference: " + (diff < 0 ? "Short " : "Over ") + formatMoney(Math.abs(diff)));
    lines.push("");
    lines.push("Visits this period:");
    group.visits.slice().sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); })
      .forEach(function (v) {
        lines.push("- " + formatDate(v.date) + " — " + (v.visitType || "Visit") + " — " + formatMoney(visitTotal(v)));
      });
    var agency = agencyById(group.agencyId);
    var contact = agency ? contactSummaryText(agency) : "";
    if (contact) { lines.push(""); lines.push(contact); }
    return lines.join("\n");
  }

  function copyDisputeMessage(message) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(message).then(function () {
        showShareMessage("Copied — paste it into your email or text message app.");
      }).catch(function () {
        showShareMessage("Couldn't copy automatically — select and copy the text manually.");
      });
    } else {
      showShareMessage("Copy isn't available in this browser — select and copy the text manually.");
    }
  }

  function shareDispute(key) {
    var group = currentDisputeGroups[key];
    if (!group) return;
    var message = buildDisputeMessage(group);
    var title = "Pay discrepancy — " + agencyName(group.agencyId);
    if (navigator.share) {
      navigator.share({ title: title, text: message }).catch(function (err) {
        if (err && err.name === "AbortError") return;
        copyDisputeMessage(message);
      });
    } else {
      copyDisputeMessage(message);
    }
  }

  function renderShareTab() {
    var list = document.getElementById("dispute-list");
    var rows = sortPeriodGroups(buildPeriodGroups()).filter(function (g) {
      return g.hasPaycheck && Math.abs(g.received - g.expected) >= 0.005;
    });

    currentDisputeGroups = {};
    list.innerHTML = "";
    rows.forEach(function (g) {
      var key = g.agencyId + "|" + g.period.start + "|" + g.period.end;
      currentDisputeGroups[key] = g;
      var diff = g.received - g.expected;
      var diffLabel = (diff < 0 ? "Short " : "Over ") + formatMoney(Math.abs(diff));
      var diffClass = diff < 0 ? "badge-disputed" : "badge-pending";
      var row = document.createElement("div");
      row.className = "day-visit-row";
      row.innerHTML =
        '<div class="dv-main"><div class="dv-company">' + escapeHtml(agencyName(g.agencyId)) + "</div>" +
        '<div class="dv-meta">' + escapeHtml(formatPeriodLabel(g.period)) + " · Expected " + escapeHtml(formatMoney(g.expected)) +
        " · Received " + escapeHtml(formatMoney(g.received)) + "</div></div>" +
        '<span class="badge ' + diffClass + '">' + escapeHtml(diffLabel) + "</span>" +
        '<div class="row-actions"><button type="button" class="icon-btn" data-share-key="' + key + '">Share</button></div>';
      list.appendChild(row);
    });
    document.getElementById("disputes-empty").hidden = rows.length !== 0;
    list.querySelectorAll("[data-share-key]").forEach(function (btn) {
      btn.addEventListener("click", function () { shareDispute(btn.dataset.shareKey); });
    });
  }

  function renderSummary() {
    var pendingTotal = visits.filter(function (v) { return v.status === "pending"; })
      .reduce(function (s, v) { return s + visitTotal(v); }, 0);
    document.getElementById("stat-pending").textContent = formatMoney(pendingTotal);

    var varianceTotal = 0;
    var openItems = 0;
    paychecks.forEach(function (p) {
      var diff = (Number(p.amount) || 0) - expectedForPaycheck(p);
      varianceTotal += diff;
      if (Math.abs(diff) >= 0.005) openItems++;
    });
    openItems += visits.filter(function (v) { return v.status === "disputed"; }).length;

    var varianceEl = document.getElementById("stat-variance");
    varianceEl.textContent = (varianceTotal >= 0 ? "+" : "") + formatMoney(varianceTotal);
    varianceEl.className = "value " + (Math.abs(varianceTotal) < 0.005 ? "ok" : "bad");

    var openEl = document.getElementById("stat-open");
    openEl.textContent = String(openItems);
    openEl.className = "value " + (openItems === 0 ? "ok" : "bad");
  }

  function renderAll() {
    populateAgencySelects();
    renderAgencies();
    renderVisits();
    renderCalendar();
    renderPaychecks();
    renderExpectedByPeriod();
    renderShareTab();
    renderSummary();
  }

  var dataMessage = document.getElementById("data-message");
  function showDataMessage(msg) {
    dataMessage.textContent = msg;
    setTimeout(function () { if (dataMessage.textContent === msg) dataMessage.textContent = ""; }, 5000);
  }

  function offerFile(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showDataMessage("Saved " + filename + ".");
  }

  document.getElementById("export-btn").addEventListener("click", function () {
    var payload = { exportedAt: new Date().toISOString(), agencies: agencies, visits: visits, paychecks: paychecks };
    offerFile("visit-pay-tracker-backup-" + new Date().toISOString().slice(0, 10) + ".json",
      JSON.stringify(payload, null, 2), "application/json");
  });

  function csvEscape(val) {
    var s = val == null ? "" : String(val);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  document.getElementById("export-csv-btn").addEventListener("click", function () {
    var header = ["Date", "Agency", "Visit Type", "Visit Pay", "Travel Pay", "Extra Pay", "Total", "Pay Date", "Status", "Notes"];
    var rows = visits.map(function (v) { return [v.date, agencyName(v.agencyId), v.visitType, v.amount, v.travelPay || 0, v.extraPay || 0, visitTotal(v), v.payDate, v.status, v.notes]; });
    var csv = [header].concat(rows).map(function (row) { return row.map(csvEscape).join(","); }).join("\r\n");
    offerFile("visits-" + new Date().toISOString().slice(0, 10) + ".csv", csv, "text/csv");
  });

  document.getElementById("import-input").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(reader.result);
        if (!Array.isArray(data.visits) || !Array.isArray(data.paychecks)) throw new Error("Invalid backup file format.");
      } catch (err) {
        showDataMessage("Import failed: " + err.message);
        e.target.value = "";
        return;
      }
      showConfirm("Import will replace all current data with the backup contents. Continue?", "Import").then(function (ok) {
        if (!ok) { e.target.value = ""; return; }
        try {
          var oldAgencies = agencies, oldVisits = visits, oldPaychecks = paychecks;
          agencies = Array.isArray(data.agencies) ? data.agencies : [];
          visits = data.visits; paychecks = data.paychecks;
          migrateLegacyData();
          saveAgencies(); saveVisits(visits); savePaychecks(paychecks);
          if (storageMode === "db" && dbApi) {
            oldAgencies.forEach(function (a) { deleteFromDb("agencies", a.id); });
            oldVisits.forEach(function (v) { deleteFromDb("visits", v.id); });
            oldPaychecks.forEach(function (p) { deleteFromDb("paychecks", p.id); });
            agencies.forEach(function (a) { pushToDb("agencies", a); });
            visits.forEach(function (v) { pushToDb("visits", v); });
            paychecks.forEach(function (p) { pushToDb("paychecks", p); });
          }
          renderAll();
          resetPaycheckForm();
          showDataMessage("Backup imported successfully.");
        } catch (err) {
          showDataMessage("Import failed: " + err.message);
        }
        e.target.value = "";
      });
    };
    reader.readAsText(file);
  });

  document.getElementById("clear-all-btn").addEventListener("click", function () {
    showConfirm("This will permanently delete ALL agencies, visits, and paychecks (including paystub photos). Export a backup first if you want to keep a copy. Continue?").then(function (ok1) {
      if (!ok1) return;
      return showConfirm("Are you absolutely sure? This cannot be undone.").then(function (ok2) {
        if (!ok2) return;
        var oldAgencies = agencies, oldVisits = visits, oldPaychecks = paychecks;
        agencies = []; visits = []; paychecks = [];
        saveAgencies(); saveVisits(visits); savePaychecks(paychecks);
        if (storageMode === "db" && dbApi) {
          oldVisits.forEach(function (v) { deleteFromDb("visits", v.id); });
          oldPaychecks.forEach(function (p) {
            deleteFromDb("paychecks", p.id);
            if (p.paystubAssetId && assetsApi) assetsApi.delete(p.paystubAssetId).catch(function () {});
          });
          oldAgencies.forEach(function (a) { deleteFromDb("agencies", a.id); });
        }
        renderAll();
        resetPaycheckForm();
        showDataMessage("All data deleted.");
      });
    });
  });

  // ---------- storage: cloud (db + assets) with a local-browser fallback ----------

  function pullFromDbAndRender() {
    setStorageStatus("Checking cloud storage…", false);
    Promise.all([
      dbApi.collection("agencies").get(),
      dbApi.collection("visits").get(),
      dbApi.collection("paychecks").get()
    ]).then(function (snaps) {
      var cloudEmpty = snaps[0].empty && snaps[1].empty && snaps[2].empty;
      if (cloudEmpty) {
        if (agencies.length || visits.length || paychecks.length) {
          agencies.forEach(function (a) { pushToDb("agencies", a); });
          visits.forEach(function (v) { pushToDb("visits", v); });
          paychecks.forEach(function (p) { pushToDb("paychecks", p); });
          setStorageStatus("Recovered your existing data into cloud storage.", false);
        } else {
          setStorageStatus(null);
        }
      } else {
        agencies = snaps[0].docs.map(docToRecord);
        visits = snaps[1].docs.map(docToRecord);
        paychecks = snaps[2].docs.map(docToRecord);
        migrateLegacyData();
        saveAgencies(); saveVisits(visits); savePaychecks(paychecks);
        renderAll();
        setStorageStatus(null);
      }
    }).catch(function () {
      setStorageStatus("Couldn't reach cloud storage — showing what's saved in this browser.", true);
    });
  }

  migrateLegacyData();
  populateAgencySelects();
  resetAgencyForm();
  renderAgencies();
  resetPaycheckForm();
  renderVisits(); renderPaychecks(); renderSummary(); renderCalendar(); renderExpectedByPeriod(); renderShareTab();

  if (window.claude && window.claude.use) {
    setStorageStatus("Checking cloud storage…", false);
    Promise.all([window.claude.use("db"), window.claude.use("assets")]).then(function (results) {
      dbApi = results[0];
      assetsApi = results[1];
      toggleAssetsUi();
      if (dbApi) {
        storageMode = "db";
        pullFromDbAndRender();
      } else {
        setStorageStatus("Cloud storage isn't available in this view — saving to this browser only.", true);
      }
    }).catch(function () {
      setStorageStatus("Cloud storage isn't available in this view — saving to this browser only.", true);
    });
  }
})();
