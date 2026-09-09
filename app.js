(function () {
  "use strict";

  var VISITS_KEY = "vpt_visits_v1";
  var PAYCHECKS_KEY = "vpt_paychecks_v1";

  // ---------- storage helpers ----------

  function loadVisits() {
    try {
      return JSON.parse(localStorage.getItem(VISITS_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function saveVisits(visits) {
    localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
  }

  function loadPaychecks() {
    try {
      return JSON.parse(localStorage.getItem(PAYCHECKS_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function savePaychecks(paychecks) {
    localStorage.setItem(PAYCHECKS_KEY, JSON.stringify(paychecks));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- state ----------

  var visits = loadVisits();
  var paychecks = loadPaychecks();

  // ---------- formatting ----------

  function formatMoney(n) {
    var v = Number(n);
    if (isNaN(v)) v = 0;
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

  // ---------- tabs ----------

  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
      document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("active"); });
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  // ---------- company datalist ----------

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

  // ---------- visits ----------

  var visitForm = document.getElementById("visit-form");
  var visitIdField = document.getElementById("visit-id");
  var visitSubmitBtn = document.getElementById("visit-submit-btn");
  var visitCancelBtn = document.getElementById("visit-cancel-btn");

  function resetVisitForm() {
    visitForm.reset();
    visitIdField.value = "";
    visitSubmitBtn.textContent = "Add Visit";
    visitCancelBtn.hidden = true;
  }

  visitForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = visitIdField.value;
    var record = {
      id: id || uid(),
      date: document.getElementById("visit-date").value,
      company: document.getElementById("visit-company").value.trim(),
      sessionType: document.getElementById("visit-session-type").value.trim(),
      amount: parseFloat(document.getElementById("visit-amount").value) || 0,
      payDate: document.getElementById("visit-pay-date").value,
      status: document.getElementById("visit-status").value,
      notes: document.getElementById("visit-notes").value.trim()
    };

    if (id) {
      var idx = visits.findIndex(function (v) { return v.id === id; });
      if (idx !== -1) visits[idx] = record;
    } else {
      visits.push(record);
    }
    saveVisits(visits);
    resetVisitForm();
    refreshCompanyList();
    renderVisits();
    renderPaychecks();
  });

  visitCancelBtn.addEventListener("click", resetVisitForm);

  function editVisit(id) {
    var v = visits.find(function (x) { return x.id === id; });
    if (!v) return;
    visitIdField.value = v.id;
    document.getElementById("visit-date").value = v.date || "";
    document.getElementById("visit-company").value = v.company || "";
    document.getElementById("visit-session-type").value = v.sessionType || "";
    document.getElementById("visit-amount").value = v.amount || "";
    document.getElementById("visit-pay-date").value = v.payDate || "";
    document.getElementById("visit-status").value = v.status || "pending";
    document.getElementById("visit-notes").value = v.notes || "";
    visitSubmitBtn.textContent = "Save Changes";
    visitCancelBtn.hidden = false;
    document.querySelector('.tab-btn[data-tab="visits"]').click();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteVisit(id) {
    if (!confirm("Delete this visit? This cannot be undone.")) return;
    visits = visits.filter(function (v) { return v.id !== id; });
    saveVisits(visits);
    renderVisits();
    renderPaychecks();
  }

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
        "<td>" + escapeHtml(formatDate(v.date)) + "</td>" +
        "<td>" + escapeHtml(v.company) + "</td>" +
        "<td>" + escapeHtml(v.sessionType || "—") + "</td>" +
        "<td>" + escapeHtml(formatMoney(v.amount)) + "</td>" +
        "<td>" + escapeHtml(formatDate(v.payDate)) + "</td>" +
        "<td>" + statusBadge(v.status) + "</td>" +
        "<td>" + escapeHtml(v.notes || "") + "</td>" +
        '<td class="row-actions">' +
        '<button type="button" class="icon-btn" data-edit="' + v.id + '">Edit</button>' +
        '<button type="button" class="icon-btn danger" data-delete="' + v.id + '">Delete</button>' +
        "</td>";
      tbody.appendChild(tr);
    });

    document.getElementById("visits-empty").hidden = filtered.length !== 0;

    var totalExpected = filtered.reduce(function (sum, v) { return sum + (Number(v.amount) || 0); }, 0);
    var pendingCount = filtered.filter(function (v) { return v.status === "pending"; }).length;
    document.getElementById("visits-totals").textContent =
      filtered.length + " visit(s) shown · total expected " + formatMoney(totalExpected) +
      " · " + pendingCount + " pending";

    tbody.querySelectorAll("[data-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () { editVisit(btn.dataset.edit); });
    });
    tbody.querySelectorAll("[data-delete]").forEach(function (btn) {
      btn.addEventListener("click", function () { deleteVisit(btn.dataset.delete); });
    });
  }

  document.getElementById("filter-company").addEventListener("input", renderVisits);
  document.getElementById("filter-status").addEventListener("change", renderVisits);

  // ---------- paychecks & reconciliation ----------

  var paycheckForm = document.getElementById("paycheck-form");
  var paycheckIdField = document.getElementById("paycheck-id");
  var paycheckSubmitBtn = document.getElementById("paycheck-submit-btn");
  var paycheckCancelBtn = document.getElementById("paycheck-cancel-btn");

  function resetPaycheckForm() {
    paycheckForm.reset();
    paycheckIdField.value = "";
    paycheckSubmitBtn.textContent = "Add Paycheck";
    paycheckCancelBtn.hidden = true;
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
    } else {
      paychecks.push(record);
    }
    savePaychecks(paychecks);
    resetPaycheckForm();
    refreshCompanyList();
    renderPaychecks();
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
    paycheckSubmitBtn.textContent = "Save Changes";
    paycheckCancelBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deletePaycheck(id) {
    if (!confirm("Delete this paycheck record? This cannot be undone.")) return;
    paychecks = paychecks.filter(function (p) { return p.id !== id; });
    savePaychecks(paychecks);
    renderPaychecks();
  }

  function expectedForPaycheck(p) {
    return visits
      .filter(function (v) {
        if ((v.company || "").trim().toLowerCase() !== (p.company || "").trim().toLowerCase()) return false;
        if (!v.date) return false;
        if (p.periodStart && v.date < p.periodStart) return false;
        if (p.periodEnd && v.date > p.periodEnd) return false;
        return true;
      })
      .reduce(function (sum, v) { return sum + (Number(v.amount) || 0); }, 0);
  }

  function renderPaychecks() {
    var tbody = document.getElementById("paychecks-tbody");
    var sorted = paychecks.slice().sort(function (a, b) {
      return (b.dateReceived || "").localeCompare(a.dateReceived || "");
    });

    tbody.innerHTML = "";
    sorted.forEach(function (p) {
      var expected = expectedForPaycheck(p);
      var actual = Number(p.amount) || 0;
      var diff = actual - expected;
      var diffClass = Math.abs(diff) < 0.005 ? "diff-ok" : "diff-bad";
      var diffLabel = (diff > 0 ? "+" : "") + formatMoney(diff);

      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(formatDate(p.dateReceived)) + "</td>" +
        "<td>" + escapeHtml(p.company) + "</td>" +
        "<td>" + escapeHtml(formatDate(p.periodStart)) + " – " + escapeHtml(formatDate(p.periodEnd)) + "</td>" +
        "<td>" + escapeHtml(formatMoney(expected)) + "</td>" +
        "<td>" + escapeHtml(formatMoney(actual)) + "</td>" +
        '<td class="' + diffClass + '">' + escapeHtml(diffLabel) + "</td>" +
        "<td>" + escapeHtml(p.ref || "—") + "</td>" +
        '<td class="row-actions">' +
        '<button type="button" class="icon-btn" data-edit-pc="' + p.id + '">Edit</button>' +
        '<button type="button" class="icon-btn danger" data-delete-pc="' + p.id + '">Delete</button>' +
        "</td>";
      tbody.appendChild(tr);
    });

    document.getElementById("paychecks-empty").hidden = sorted.length !== 0;

    tbody.querySelectorAll("[data-edit-pc]").forEach(function (btn) {
      btn.addEventListener("click", function () { editPaycheck(btn.dataset.editPc); });
    });
    tbody.querySelectorAll("[data-delete-pc]").forEach(function (btn) {
      btn.addEventListener("click", function () { deletePaycheck(btn.dataset.deletePc); });
    });
  }

  // ---------- data export / import / clear ----------

  var dataMessage = document.getElementById("data-message");

  function showDataMessage(msg) {
    dataMessage.textContent = msg;
    setTimeout(function () {
      if (dataMessage.textContent === msg) dataMessage.textContent = "";
    }, 5000);
  }

  function downloadFile(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  document.getElementById("export-btn").addEventListener("click", function () {
    var payload = {
      exportedAt: new Date().toISOString(),
      visits: visits,
      paychecks: paychecks
    };
    downloadFile("visit-pay-tracker-backup-" + new Date().toISOString().slice(0, 10) + ".json",
      JSON.stringify(payload, null, 2), "application/json");
    showDataMessage("Backup exported.");
  });

  function csvEscape(val) {
    var s = val == null ? "" : String(val);
    if (/[",\n]/.test(s)) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  document.getElementById("export-csv-btn").addEventListener("click", function () {
    var header = ["Date", "Company", "Session Type", "Expected Pay", "Pay Date", "Status", "Notes"];
    var rows = visits.map(function (v) {
      return [v.date, v.company, v.sessionType, v.amount, v.payDate, v.status, v.notes];
    });
    var csv = [header].concat(rows).map(function (row) {
      return row.map(csvEscape).join(",");
    }).join("\r\n");
    downloadFile("visits-" + new Date().toISOString().slice(0, 10) + ".csv", csv, "text/csv");
    showDataMessage("Visits CSV exported.");
  });

  document.getElementById("import-input").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!Array.isArray(data.visits) || !Array.isArray(data.paychecks)) {
          throw new Error("Invalid backup file format.");
        }
        if (!confirm("Import will replace all current data in this browser with the backup contents. Continue?")) {
          e.target.value = "";
          return;
        }
        visits = data.visits;
        paychecks = data.paychecks;
        saveVisits(visits);
        savePaychecks(paychecks);
        refreshCompanyList();
        renderVisits();
        renderPaychecks();
        showDataMessage("Backup imported successfully.");
      } catch (err) {
        showDataMessage("Import failed: " + err.message);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  document.getElementById("clear-all-btn").addEventListener("click", function () {
    if (!confirm("This will permanently delete ALL visits and paychecks from this browser. Export a backup first if you want to keep a copy. Continue?")) return;
    if (!confirm("Are you absolutely sure? This cannot be undone.")) return;
    visits = [];
    paychecks = [];
    saveVisits(visits);
    savePaychecks(paychecks);
    refreshCompanyList();
    renderVisits();
    renderPaychecks();
    showDataMessage("All data deleted.");
  });

  // ---------- init ----------

  refreshCompanyList();
  renderVisits();
  renderPaychecks();
})();
