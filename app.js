(function () {
  "use strict";

  var VISITS_KEY = "vpt_visits_v1";
  var PAYCHECKS_KEY = "vpt_paychecks_v1";

  function loadVisits() { try { return JSON.parse(localStorage.getItem(VISITS_KEY) || "[]"); } catch (e) { return []; } }
  function saveVisits(v) { localStorage.setItem(VISITS_KEY, JSON.stringify(v)); }
  function loadPaychecks() { try { return JSON.parse(localStorage.getItem(PAYCHECKS_KEY) || "[]"); } catch (e) { return []; } }
  function savePaychecks(p) { localStorage.setItem(PAYCHECKS_KEY, JSON.stringify(p)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  var visits = loadVisits();
  var paychecks = loadPaychecks();

  function formatMoney(n) {
    var v = Number(n); if (isNaN(v)) v = 0;
    return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
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

  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  function refreshCompanyList() {
    var companies = new Set();
    visits.forEach(function (v) { if (v.company) companies.add(v.company); });
    paychecks.forEach(function (p) { if (p.company) companies.add(p.company); });
    var list = document.getElementById("company-list");
    list.innerHTML = "";
    Array.from(companies).sort().forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      list.appendChild(opt);
    });
  }

  // ---------- visit modal (add / edit, opened from the calendar or the table) ----------

  var modalOverlay = document.getElementById("visit-modal-overlay");
  var modalDateLabel = document.getElementById("modal-date-label");
  var modalDayList = document.getElementById("modal-day-list");
  var modalForm = document.getElementById("modal-visit-form");
  var modalFormHeading = document.getElementById("modal-form-heading");
  var mVisitId = document.getElementById("m-visit-id");
  var mVisitSubmitBtn = document.getElementById("m-visit-submit-btn");
  var mVisitCancelEditBtn = document.getElementById("m-visit-cancel-edit-btn");
  var mVisitDeleteBtn = document.getElementById("m-visit-delete-btn");
  var modalOpenDate = null;

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
    modalFormHeading.textContent = "Add a visit";
    mVisitSubmitBtn.textContent = "Add visit";
    mVisitCancelEditBtn.hidden = true;
    mVisitDeleteBtn.hidden = true;
  }

  function renderModalDayList(dateIso) {
    var dayVisits = visits.filter(function (v) { return v.date === dateIso; })
      .sort(function (a, b) { return (a.company || "").localeCompare(b.company || ""); });
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
        '<div class="dv-main"><div class="dv-company">' + escapeHtml(v.company) + "</div>" +
        '<div class="dv-meta">' + escapeHtml(v.sessionType || "—") + " · " + escapeHtml(formatMoney(v.amount)) + "</div></div>" +
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

  function openDayModal(dateIso, editId) {
    modalOpenDate = dateIso;
    modalDateLabel.textContent = weekdayLong(dateIso);
    renderModalDayList(dateIso);
    if (editId) {
      populateModalForEdit(editId);
    } else {
      resetModalForm(dateIso);
    }
    modalOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    window.setTimeout(function () { document.getElementById("m-visit-company").focus(); }, 0);
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
    document.getElementById("m-visit-company").value = v.company || "";
    document.getElementById("m-visit-session-type").value = v.sessionType || "";
    document.getElementById("m-visit-amount").value = v.amount || "";
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
      company: document.getElementById("m-visit-company").value.trim(),
      sessionType: document.getElementById("m-visit-session-type").value.trim(),
      amount: parseFloat(document.getElementById("m-visit-amount").value) || 0,
      payDate: document.getElementById("m-visit-pay-date").value,
      status: document.getElementById("m-visit-status").value,
      notes: document.getElementById("m-visit-notes").value.trim()
    };
    if (id) {
      var idx = visits.findIndex(function (v) { return v.id === id; });
      if (idx !== -1) visits[idx] = record;
    } else { visits.push(record); }
    saveVisits(visits);
    refreshCompanyList(); renderVisits(); renderPaychecks(); renderSummary(); renderCalendar();
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
    if (!confirm("Delete this visit? This cannot be undone.")) return;
    var wasOpenDate = modalOpenDate;
    visits = visits.filter(function (v) { return v.id !== id; });
    saveVisits(visits); renderVisits(); renderPaychecks(); renderSummary(); renderCalendar();
    if (keepModalOpen && wasOpenDate) {
      resetModalForm(wasOpenDate);
      renderModalDayList(wasOpenDate);
    }
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
        total.textContent = formatMoney(dayVisits.reduce(function (s, v) { return s + (Number(v.amount) || 0); }, 0));
        head.appendChild(total);
      }
      cell.appendChild(head);

      var shown = dayVisits.slice(0, 3);
      shown.forEach(function (v) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "cal-chip chip-" + v.status;
        chip.textContent = v.company + " · " + formatMoney(v.amount);
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

  function statusBadge(status) {
    var label = status.charAt(0).toUpperCase() + status.slice(1);
    return '<span class="badge badge-' + status + '">' + label + "</span>";
  }

  function renderVisits() {
    var tbody = document.getElementById("visits-tbody");
    var companyFilter = document.getElementById("filter-company").value.trim().toLowerCase();
    var statusFilter = document.getElementById("filter-status").value;

    var filtered = visits.filter(function (v) {
      if (companyFilter && (v.company || "").toLowerCase().indexOf(companyFilter) === -1) return false;
      if (statusFilter && v.status !== statusFilter) return false;
      return true;
    });
    filtered.sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });

    tbody.innerHTML = "";
    filtered.forEach(function (v) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td class=\"num\">" + escapeHtml(formatDate(v.date)) + "</td>" +
        "<td>" + escapeHtml(v.company) + "</td>" +
        "<td>" + escapeHtml(v.sessionType || "—") + "</td>" +
        "<td class=\"num\">" + escapeHtml(formatMoney(v.amount)) + "</td>" +
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

    var totalExpected = filtered.reduce(function (s, v) { return s + (Number(v.amount) || 0); }, 0);
    var pendingCount = filtered.filter(function (v) { return v.status === "pending"; }).length;
    document.getElementById("visits-totals").textContent =
      filtered.length + " visit(s) shown · total expected " + formatMoney(totalExpected) +
      " · " + pendingCount + " pending";

    tbody.querySelectorAll("[data-edit]").forEach(function (btn) { btn.addEventListener("click", function () { editVisit(btn.dataset.edit); }); });
    tbody.querySelectorAll("[data-delete]").forEach(function (btn) { btn.addEventListener("click", function () { deleteVisit(btn.dataset.delete); }); });
  }

  document.getElementById("filter-company").addEventListener("input", renderVisits);
  document.getElementById("filter-status").addEventListener("change", renderVisits);

  var paycheckForm = document.getElementById("paycheck-form");
  var paycheckIdField = document.getElementById("paycheck-id");
  var paycheckSubmitBtn = document.getElementById("paycheck-submit-btn");
  var paycheckCancelBtn = document.getElementById("paycheck-cancel-btn");

  function resetPaycheckForm() {
    paycheckForm.reset(); paycheckIdField.value = "";
    paycheckSubmitBtn.textContent = "Add paycheck"; paycheckCancelBtn.hidden = true;
  }

  paycheckForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = paycheckIdField.value;
    var record = {
      id: id || uid(),
      company: document.getElementById("paycheck-company").value.trim(),
      dateReceived: document.getElementById("paycheck-date").value,
      periodStart: document.getElementById("paycheck-period-start").value,
      periodEnd: document.getElementById("paycheck-period-end").value,
      amount: parseFloat(document.getElementById("paycheck-amount").value) || 0,
      ref: document.getElementById("paycheck-ref").value.trim(),
      notes: document.getElementById("paycheck-notes").value.trim()
    };
    if (id) {
      var idx = paychecks.findIndex(function (p) { return p.id === id; });
      if (idx !== -1) paychecks[idx] = record;
    } else { paychecks.push(record); }
    savePaychecks(paychecks);
    resetPaycheckForm();
    refreshCompanyList(); renderPaychecks(); renderSummary();
  });

  paycheckCancelBtn.addEventListener("click", resetPaycheckForm);

  function editPaycheck(id) {
    var p = paychecks.find(function (x) { return x.id === id; });
    if (!p) return;
    paycheckIdField.value = p.id;
    document.getElementById("paycheck-company").value = p.company || "";
    document.getElementById("paycheck-date").value = p.dateReceived || "";
    document.getElementById("paycheck-period-start").value = p.periodStart || "";
    document.getElementById("paycheck-period-end").value = p.periodEnd || "";
    document.getElementById("paycheck-amount").value = p.amount || "";
    document.getElementById("paycheck-ref").value = p.ref || "";
    document.getElementById("paycheck-notes").value = p.notes || "";
    paycheckSubmitBtn.textContent = "Save changes"; paycheckCancelBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deletePaycheck(id) {
    if (!confirm("Delete this paycheck record? This cannot be undone.")) return;
    paychecks = paychecks.filter(function (p) { return p.id !== id; });
    savePaychecks(paychecks); renderPaychecks(); renderSummary();
  }

  function expectedForPaycheck(p) {
    return visits.filter(function (v) {
      if ((v.company || "").trim().toLowerCase() !== (p.company || "").trim().toLowerCase()) return false;
      if (!v.date) return false;
      if (p.periodStart && v.date < p.periodStart) return false;
      if (p.periodEnd && v.date > p.periodEnd) return false;
      return true;
    }).reduce(function (s, v) { return s + (Number(v.amount) || 0); }, 0);
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
        "<td>" + escapeHtml(p.company) + "</td>" +
        "<td class=\"num\">" + escapeHtml(formatDate(p.periodStart)) + " – " + escapeHtml(formatDate(p.periodEnd)) + "</td>" +
        "<td class=\"num\">" + escapeHtml(formatMoney(expected)) + "</td>" +
        "<td class=\"num\">" + escapeHtml(formatMoney(actual)) + "</td>" +
        '<td class="num ' + diffClass + '">' + escapeHtml(diffLabel) + "</td>" +
        "<td>" + escapeHtml(p.ref || "—") + "</td>" +
        '<td class="row-actions">' +
        '<button type="button" class="icon-btn" data-edit-pc="' + p.id + '">Edit</button>' +
        '<button type="button" class="icon-btn danger" data-delete-pc="' + p.id + '">Delete</button>' +
        "</td>";
      tbody.appendChild(tr);
    });

    document.getElementById("paychecks-empty").hidden = sorted.length !== 0;

    tbody.querySelectorAll("[data-edit-pc]").forEach(function (btn) { btn.addEventListener("click", function () { editPaycheck(btn.dataset.editPc); }); });
    tbody.querySelectorAll("[data-delete-pc]").forEach(function (btn) { btn.addEventListener("click", function () { deletePaycheck(btn.dataset.deletePc); }); });
  }

  function renderSummary() {
    var pendingTotal = visits.filter(function (v) { return v.status === "pending"; })
      .reduce(function (s, v) { return s + (Number(v.amount) || 0); }, 0);
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
    var payload = { exportedAt: new Date().toISOString(), visits: visits, paychecks: paychecks };
    offerFile("visit-pay-tracker-backup-" + new Date().toISOString().slice(0, 10) + ".json",
      JSON.stringify(payload, null, 2), "application/json");
  });

  function csvEscape(val) {
    var s = val == null ? "" : String(val);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  document.getElementById("export-csv-btn").addEventListener("click", function () {
    var header = ["Date", "Company", "Session Type", "Expected Pay", "Pay Date", "Status", "Notes"];
    var rows = visits.map(function (v) { return [v.date, v.company, v.sessionType, v.amount, v.payDate, v.status, v.notes]; });
    var csv = [header].concat(rows).map(function (row) { return row.map(csvEscape).join(","); }).join("\r\n");
    offerFile("visits-" + new Date().toISOString().slice(0, 10) + ".csv", csv, "text/csv");
  });

  document.getElementById("import-input").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!Array.isArray(data.visits) || !Array.isArray(data.paychecks)) throw new Error("Invalid backup file format.");
        if (!confirm("Import will replace all current data in this browser with the backup contents. Continue?")) { e.target.value = ""; return; }
        visits = data.visits; paychecks = data.paychecks;
        saveVisits(visits); savePaychecks(paychecks);
        refreshCompanyList(); renderVisits(); renderPaychecks(); renderSummary(); renderCalendar();
        showDataMessage("Backup imported successfully.");
      } catch (err) { showDataMessage("Import failed: " + err.message); }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  document.getElementById("clear-all-btn").addEventListener("click", function () {
    if (!confirm("This will permanently delete ALL visits and paychecks from this browser. Export a backup first if you want to keep a copy. Continue?")) return;
    if (!confirm("Are you absolutely sure? This cannot be undone.")) return;
    visits = []; paychecks = [];
    saveVisits(visits); savePaychecks(paychecks);
    refreshCompanyList(); renderVisits(); renderPaychecks(); renderSummary(); renderCalendar();
    showDataMessage("All data deleted.");
  });

  refreshCompanyList(); renderVisits(); renderPaychecks(); renderSummary(); renderCalendar();
})();
