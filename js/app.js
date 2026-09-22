(function () {
  "use strict";

  var STORAGE_KEY = "suneung-planner-state-v1";
  var WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

  var els = {
    examDate: document.getElementById("exam-date"),
    ddayNumber: document.getElementById("dday-number"),
    subjectList: document.getElementById("subject-list"),
    addSubject: document.getElementById("add-subject"),
    reviewOffset: document.getElementById("review-offset"),
    reviewRatio: document.getElementById("review-ratio"),
    finalReviewDays: document.getElementById("final-review-days"),
    generatePlan: document.getElementById("generate-plan"),
    summaryCard: document.getElementById("summary-card"),
    progressList: document.getElementById("progress-list"),
    planCard: document.getElementById("plan-card"),
    planTable: document.getElementById("plan-table"),
    emptyMessage: document.getElementById("empty-message"),
    subjectRowTemplate: document.getElementById("subject-row-template"),
    showUpcoming: document.getElementById("show-upcoming"),
    showAll: document.getElementById("show-all"),
  };

  var state = loadState();
  var viewMode = "upcoming"; // 'upcoming' | 'all'

  function defaultState() {
    return {
      examDate: "",
      subjects: [
        { id: uid(), name: "", total: null, unit: "쪽" },
      ],
      settings: {
        reviewOffsetDays: 3,
        reviewRatio: 30,
        finalReviewDays: 10,
      },
      history: {},
    };
  }

  function uid() {
    return "s" + Math.random().toString(36).slice(2, 10);
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return defaultState();
      parsed.subjects = Array.isArray(parsed.subjects) && parsed.subjects.length
        ? parsed.subjects
        : defaultState().subjects;
      parsed.settings = parsed.settings || defaultState().settings;
      parsed.history = parsed.history || {};
      return parsed;
    } catch (e) {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // storage unavailable; ignore
    }
  }

  // ---------- date helpers ----------

  function startOfDay(d) {
    var nd = new Date(d);
    nd.setHours(0, 0, 0, 0);
    return nd;
  }

  function todayDate() {
    return startOfDay(new Date());
  }

  function addDays(date, n) {
    var nd = new Date(date);
    nd.setDate(nd.getDate() + n);
    return nd;
  }

  function daysBetween(a, b) {
    var MS = 24 * 60 * 60 * 1000;
    return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS);
  }

  function dateKey(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function formatShort(d) {
    return (d.getMonth() + 1) + "/" + d.getDate() + " (" + WEEKDAY_KR[d.getDay()] + ")";
  }

  // ---------- distribution ----------

  function distributeEvenly(total, count) {
    if (!count || count <= 0 || !total || total <= 0) {
      return new Array(Math.max(count, 0)).fill(0);
    }
    var base = Math.floor((total / count) * 10) / 10;
    var arr = new Array(count).fill(base);
    var assigned = round1(base * count);
    var remainder = round1(total - assigned);
    var steps = Math.round(remainder * 10);
    for (var i = 0; i < steps && i < count; i++) {
      arr[i] = round1(arr[i] + 0.1);
    }
    return arr;
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  // ---------- subjects UI ----------

  function renderSubjects() {
    els.subjectList.innerHTML = "";
    state.subjects.forEach(function (subj) {
      var frag = els.subjectRowTemplate.content.cloneNode(true);
      var row = frag.querySelector(".subject-row");
      row.dataset.id = subj.id;
      var nameInput = row.querySelector(".subject-name");
      var totalInput = row.querySelector(".subject-total");
      var unitInput = row.querySelector(".subject-unit");
      nameInput.value = subj.name || "";
      totalInput.value = subj.total === null || subj.total === undefined ? "" : subj.total;
      unitInput.value = subj.unit || "쪽";

      nameInput.addEventListener("input", function () {
        subj.name = nameInput.value;
        saveState();
      });
      totalInput.addEventListener("input", function () {
        var v = parseFloat(totalInput.value);
        subj.total = isNaN(v) ? null : v;
        saveState();
      });
      unitInput.addEventListener("input", function () {
        subj.unit = unitInput.value;
        saveState();
      });
      row.querySelector(".remove-subject").addEventListener("click", function () {
        state.subjects = state.subjects.filter(function (s) { return s.id !== subj.id; });
        saveState();
        renderSubjects();
      });

      els.subjectList.appendChild(frag);
    });
  }

  els.addSubject.addEventListener("click", function () {
    state.subjects.push({ id: uid(), name: "", total: null, unit: "쪽" });
    saveState();
    renderSubjects();
  });

  // ---------- settings UI ----------

  function renderSettings() {
    els.examDate.value = state.examDate || "";
    els.reviewOffset.value = state.settings.reviewOffsetDays;
    els.reviewRatio.value = state.settings.reviewRatio;
    els.finalReviewDays.value = state.settings.finalReviewDays;
    updateDday();
  }

  els.examDate.addEventListener("change", function () {
    state.examDate = els.examDate.value;
    saveState();
    updateDday();
  });
  els.reviewOffset.addEventListener("input", function () {
    state.settings.reviewOffsetDays = clampInt(els.reviewOffset.value, 1, 30, 3);
    saveState();
  });
  els.reviewRatio.addEventListener("input", function () {
    state.settings.reviewRatio = clampInt(els.reviewRatio.value, 0, 100, 30);
    saveState();
  });
  els.finalReviewDays.addEventListener("input", function () {
    state.settings.finalReviewDays = clampInt(els.finalReviewDays.value, 0, 90, 10);
    saveState();
  });

  function clampInt(v, min, max, fallback) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function updateDday() {
    if (!state.examDate) {
      els.ddayNumber.textContent = "D-?";
      return;
    }
    var exam = startOfDay(new Date(state.examDate + "T00:00:00"));
    var diff = daysBetween(todayDate(), exam);
    if (diff > 0) els.ddayNumber.textContent = "D-" + diff;
    else if (diff === 0) els.ddayNumber.textContent = "D-DAY";
    else els.ddayNumber.textContent = "D+" + Math.abs(diff);
  }

  // ---------- plan generation ----------

  function generatePlan() {
    if (!state.examDate) {
      alert("수능일을 먼저 입력해주세요.");
      return;
    }
    var validSubjects = state.subjects.filter(function (s) {
      return s.name && s.total && s.total > 0;
    });
    if (!validSubjects.length) {
      alert("과목명과 총 학습량을 하나 이상 입력해주세요.");
      return;
    }

    var today = todayDate();
    var exam = startOfDay(new Date(state.examDate + "T00:00:00"));
    var totalStudyDays = daysBetween(today, exam); // days strictly before exam day

    if (totalStudyDays <= 0) {
      alert("수능일이 오늘이거나 이미 지났어요. 날짜를 확인해주세요.");
      return;
    }

    var settings = state.settings;
    var finalReviewDays = Math.min(settings.finalReviewDays, Math.max(totalStudyDays - 1, 0));
    var newContentDays = totalStudyDays - finalReviewDays;
    if (newContentDays < 1) {
      newContentDays = 1;
      finalReviewDays = totalStudyDays - 1;
    }

    var reviewOffset = settings.reviewOffsetDays;
    var reviewRatio = settings.reviewRatio / 100;

    // compute remaining amount per subject from confirmed-done history
    var remaining = {};
    var doneSoFar = {};
    validSubjects.forEach(function (s) {
      var done = 0;
      Object.keys(state.history).forEach(function (key) {
        var entry = state.history[key] && state.history[key][s.id];
        if (entry && entry.newDone) done += entry.newAmount || 0;
      });
      doneSoFar[s.id] = round1(done);
      remaining[s.id] = Math.max(round1(s.total - done), 0);
    });

    var newDistribution = {};
    var finalDistribution = {};
    validSubjects.forEach(function (s) {
      newDistribution[s.id] = distributeEvenly(remaining[s.id], newContentDays);
      finalDistribution[s.id] = distributeEvenly(s.total, finalReviewDays);
    });

    for (var i = 0; i < totalStudyDays; i++) {
      var date = addDays(today, i);
      var key = dateKey(date);
      if (!state.history[key]) state.history[key] = {};

      validSubjects.forEach(function (s) {
        var isFinal = i >= newContentDays;
        var newAmount = 0;
        var reviewAmount = 0;

        if (!isFinal) {
          newAmount = newDistribution[s.id][i] || 0;
          var offsetIdx = i - reviewOffset;
          if (offsetIdx >= 0 && offsetIdx < newContentDays) {
            reviewAmount = round1((newDistribution[s.id][offsetIdx] || 0) * reviewRatio);
          }
        } else {
          reviewAmount = finalDistribution[s.id][i - newContentDays] || 0;
        }

        var prev = state.history[key][s.id];
        state.history[key][s.id] = {
          newAmount: newAmount,
          reviewAmount: reviewAmount,
          newDone: prev ? !!prev.newDone : false,
          reviewDone: prev ? !!prev.reviewDone : false,
        };
      });
    }

    saveState();
    render();
  }

  els.generatePlan.addEventListener("click", generatePlan);
  els.showUpcoming.addEventListener("click", function () {
    viewMode = "upcoming";
    els.showUpcoming.classList.add("active");
    els.showAll.classList.remove("active");
    renderPlanTable();
  });
  els.showAll.addEventListener("click", function () {
    viewMode = "all";
    els.showAll.classList.add("active");
    els.showUpcoming.classList.remove("active");
    renderPlanTable();
  });

  // ---------- rendering ----------

  function currentPlanSubjects() {
    return state.subjects.filter(function (s) {
      return s.name && s.total && s.total > 0;
    });
  }

  function hasPlan() {
    return Object.keys(state.history).length > 0;
  }

  function render() {
    renderSubjects();
    renderSettings();

    if (!hasPlan()) {
      els.summaryCard.hidden = true;
      els.planCard.hidden = true;
      els.emptyMessage.hidden = false;
      return;
    }

    els.emptyMessage.hidden = true;
    els.summaryCard.hidden = false;
    els.planCard.hidden = false;
    renderProgress();
    renderPlanTable();
  }

  function renderProgress() {
    var subjects = currentPlanSubjects();
    els.progressList.innerHTML = "";
    subjects.forEach(function (s) {
      var done = 0;
      Object.keys(state.history).forEach(function (key) {
        var entry = state.history[key][s.id];
        if (entry && entry.newDone) done += entry.newAmount || 0;
      });
      var pct = s.total > 0 ? Math.min(100, Math.round((done / s.total) * 100)) : 0;

      var item = document.createElement("div");
      item.className = "progress-item";
      item.innerHTML =
        '<span class="name">' + escapeHtml(s.name) + '</span>' +
        '<div class="progress-bar"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="pct">' + round1(done) + ' / ' + s.total + s.unit + ' (' + pct + '%)</span>';
      els.progressList.appendChild(item);
    });
  }

  function renderPlanTable() {
    var subjects = currentPlanSubjects();
    var today = todayDate();
    var allKeys = Object.keys(state.history).sort();
    var futureKeys = allKeys.filter(function (k) {
      return new Date(k + "T00:00:00") >= today;
    });
    var keys = viewMode === "upcoming" ? futureKeys.slice(0, 14) : futureKeys;

    var exam = state.examDate ? startOfDay(new Date(state.examDate + "T00:00:00")) : null;

    var thead = els.planTable.querySelector("thead");
    var tbody = els.planTable.querySelector("tbody");

    var headRow = document.createElement("tr");
    headRow.innerHTML = "<th>날짜</th><th>D-day</th>" + subjects.map(function (s) {
      return "<th>" + escapeHtml(s.name) + "</th>";
    }).join("");
    thead.innerHTML = "";
    thead.appendChild(headRow);

    tbody.innerHTML = "";
    keys.forEach(function (key) {
      var date = new Date(key + "T00:00:00");
      var isToday = dateKey(date) === dateKey(today);
      var isWeekend = date.getDay() === 0 || date.getDay() === 6;
      var dday = exam ? daysBetween(date, exam) : null;

      var tr = document.createElement("tr");
      var classes = [];
      if (isToday) classes.push("today");
      if (isWeekend) classes.push("weekend");
      tr.className = classes.join(" ");

      var ddayLabel = dday === 0 ? "D-DAY" : dday > 0 ? "D-" + dday : "D+" + Math.abs(dday);
      var cells = '<td class="date-cell">' + formatShort(date) + (isToday ? " · 오늘" : "") + '</td>' +
        '<td>' + ddayLabel + '</td>';

      subjects.forEach(function (s) {
        var entry = state.history[key][s.id] || { newAmount: 0, reviewAmount: 0, newDone: false, reviewDone: false };
        var parts = [];
        if (entry.newAmount > 0) {
          parts.push(
            '<label class="cell-task"><input type="checkbox" data-key="' + key + '" data-sid="' + s.id + '" data-field="newDone" ' +
            (entry.newDone ? "checked" : "") + '> <span class="new-amt">신규 ' + entry.newAmount + s.unit + '</span></label>'
          );
        }
        if (entry.reviewAmount > 0) {
          parts.push(
            '<label class="cell-task"><input type="checkbox" data-key="' + key + '" data-sid="' + s.id + '" data-field="reviewDone" ' +
            (entry.reviewDone ? "checked" : "") + '> <span class="review-amt">복습 ' + entry.reviewAmount + s.unit + '</span></label>'
          );
        }
        if (!parts.length) parts.push('<span class="review-amt">-</span>');
        cells += "<td>" + parts.join(" ") + "</td>";
      });

      tr.innerHTML = cells;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var key = cb.dataset.key;
        var sid = cb.dataset.sid;
        var field = cb.dataset.field;
        state.history[key][sid][field] = cb.checked;
        saveState();
        renderProgress();
      });
    });
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- init ----------

  render();
})();
