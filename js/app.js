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
    showUpcoming: document.getElementById("show-upcoming"),
    showAll: document.getElementById("show-all"),
  };

  var state = loadState();
  var viewMode = "upcoming"; // 'upcoming' | 'all'

  function defaultState() {
    return {
      examDate: "",
      subjects: [
        { id: uid(), name: "", books: [{ id: uid(), name: "", total: null, unit: "쪽" }] },
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
    return "id" + Math.random().toString(36).slice(2, 10);
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
      migrateState(parsed);
      return parsed;
    } catch (e) {
      return defaultState();
    }
  }

  // upgrades the pre-multi-book schema (subject.total/unit, history entry
  // newAmount/newDone/reviewAmount/reviewDone) to the books[] + segments[] shape.
  function migrateState(parsed) {
    parsed.subjects = parsed.subjects.map(function (s) {
      if (Array.isArray(s.books)) return s;
      return {
        id: s.id || uid(),
        name: s.name || "",
        books: [{ id: uid(), name: s.name || "문제집 1", total: s.total != null ? s.total : null, unit: s.unit || "쪽" }],
      };
    });

    Object.keys(parsed.history).forEach(function (key) {
      var dayEntry = parsed.history[key];
      Object.keys(dayEntry).forEach(function (subjId) {
        var entry = dayEntry[subjId];
        if (!entry || entry.newSegments) return;
        var subj = parsed.subjects.filter(function (s) { return s.id === subjId; })[0];
        var bookId = subj && subj.books[0] ? subj.books[0].id : null;
        var newSegments = (entry.newAmount > 0 && bookId)
          ? [{ bookId: bookId, amount: entry.newAmount, done: !!entry.newDone }]
          : [];
        var reviewSegments = (entry.reviewAmount > 0 && bookId)
          ? [{ bookId: bookId, amount: entry.reviewAmount, done: !!entry.reviewDone }]
          : [];
        dayEntry[subjId] = { newSegments: newSegments, reviewSegments: reviewSegments };
      });
    });
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

  function findBook(subject, bookId) {
    for (var i = 0; i < subject.books.length; i++) {
      if (subject.books[i].id === bookId) return subject.books[i];
    }
    return null;
  }

  // ---------- subjects UI ----------

  function renderSubjects() {
    els.subjectList.innerHTML = "";
    state.subjects.forEach(function (subject) {
      els.subjectList.appendChild(buildSubjectGroup(subject));
    });
  }

  function buildSubjectGroup(subject) {
    var group = document.createElement("div");
    group.className = "subject-group";
    group.dataset.id = subject.id;

    var header = document.createElement("div");
    header.className = "subject-group-header";

    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "subject-name";
    nameInput.placeholder = "과목명 (예: 국어)";
    nameInput.value = subject.name || "";
    nameInput.addEventListener("input", function () {
      subject.name = nameInput.value;
      saveState();
    });

    var removeSubjectBtn = document.createElement("button");
    removeSubjectBtn.type = "button";
    removeSubjectBtn.className = "btn remove-subject-btn";
    removeSubjectBtn.textContent = "과목 삭제";
    removeSubjectBtn.addEventListener("click", function () {
      state.subjects = state.subjects.filter(function (s) { return s.id !== subject.id; });
      saveState();
      renderSubjects();
    });

    header.appendChild(nameInput);
    header.appendChild(removeSubjectBtn);
    group.appendChild(header);

    var bookList = document.createElement("div");
    bookList.className = "book-list";
    subject.books.forEach(function (book, idx) {
      bookList.appendChild(buildBookRow(subject, book, idx));
    });
    group.appendChild(bookList);

    group.appendChild(buildBulkAddRow(subject));

    return group;
  }

  function buildBulkAddRow(subject) {
    var row = document.createElement("div");
    row.className = "bulk-add-row";

    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "bulk-name";
    nameInput.placeholder = "문제집명 (예: 쎈 수학)";

    var totalInput = document.createElement("input");
    totalInput.type = "number";
    totalInput.className = "bulk-total";
    totalInput.placeholder = "권당 분량";
    totalInput.min = "0";
    totalInput.step = "1";

    var unitInput = document.createElement("input");
    unitInput.type = "text";
    unitInput.className = "bulk-unit";
    unitInput.placeholder = "단위";
    unitInput.value = "쪽";

    var countInput = document.createElement("input");
    countInput.type = "number";
    countInput.className = "bulk-count";
    countInput.placeholder = "개수";
    countInput.min = "1";
    countInput.step = "1";
    countInput.value = "1";
    countInput.title = "같은 이름으로 몇 권(회독)을 한번에 추가할지";

    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn secondary bulk-add-btn";
    addBtn.textContent = "한번에 추가";
    addBtn.addEventListener("click", function () {
      var name = nameInput.value.trim();
      if (!name) {
        alert("문제집명을 입력해주세요.");
        return;
      }
      var total = parseFloat(totalInput.value);
      total = isNaN(total) ? null : total;
      var unit = unitInput.value.trim() || "쪽";
      var count = clampInt(countInput.value, 1, 50, 1);
      for (var k = 0; k < count; k++) {
        subject.books.push({ id: uid(), name: name, total: total, unit: unit });
      }
      saveState();
      renderSubjects();
    });

    row.appendChild(nameInput);
    row.appendChild(totalInput);
    row.appendChild(unitInput);
    row.appendChild(countInput);
    row.appendChild(addBtn);
    return row;
  }

  function buildBookRow(subject, book, idx) {
    var row = document.createElement("div");
    row.className = "book-row";
    row.dataset.id = book.id;

    var orderDiv = document.createElement("div");
    orderDiv.className = "book-order-btns";

    var upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "order-btn";
    upBtn.textContent = "▲";
    upBtn.disabled = idx === 0;
    upBtn.title = "순서를 앞으로";
    upBtn.addEventListener("click", function () {
      if (idx <= 0) return;
      var tmp = subject.books[idx - 1];
      subject.books[idx - 1] = subject.books[idx];
      subject.books[idx] = tmp;
      saveState();
      renderSubjects();
    });

    var downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "order-btn";
    downBtn.textContent = "▼";
    downBtn.disabled = idx === subject.books.length - 1;
    downBtn.title = "순서를 뒤로";
    downBtn.addEventListener("click", function () {
      if (idx >= subject.books.length - 1) return;
      var tmp = subject.books[idx + 1];
      subject.books[idx + 1] = subject.books[idx];
      subject.books[idx] = tmp;
      saveState();
      renderSubjects();
    });

    orderDiv.appendChild(upBtn);
    orderDiv.appendChild(downBtn);

    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "book-name";
    nameInput.placeholder = (idx + 1) + "번째 문제집명 (예: 자이스토리)";
    nameInput.value = book.name || "";
    nameInput.addEventListener("input", function () {
      book.name = nameInput.value;
      saveState();
    });

    var totalInput = document.createElement("input");
    totalInput.type = "number";
    totalInput.className = "book-total";
    totalInput.placeholder = "총 분량";
    totalInput.min = "0";
    totalInput.step = "1";
    totalInput.value = book.total === null || book.total === undefined ? "" : book.total;
    totalInput.addEventListener("input", function () {
      var v = parseFloat(totalInput.value);
      book.total = isNaN(v) ? null : v;
      saveState();
    });

    var unitInput = document.createElement("input");
    unitInput.type = "text";
    unitInput.className = "book-unit";
    unitInput.placeholder = "단위";
    unitInput.value = book.unit || "쪽";
    unitInput.addEventListener("input", function () {
      book.unit = unitInput.value;
      saveState();
    });

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-book";
    removeBtn.title = "삭제";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", function () {
      subject.books = subject.books.filter(function (b) { return b.id !== book.id; });
      saveState();
      renderSubjects();
    });

    row.appendChild(orderDiv);
    row.appendChild(nameInput);
    row.appendChild(totalInput);
    row.appendChild(unitInput);
    row.appendChild(removeBtn);
    return row;
  }

  els.addSubject.addEventListener("click", function () {
    state.subjects.push({ id: uid(), name: "", books: [{ id: uid(), name: "", total: null, unit: "쪽" }] });
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

  function currentPlanSubjects() {
    return state.subjects.filter(function (s) {
      return s.name && s.books.some(function (b) { return b.total > 0; });
    });
  }

  function generatePlan() {
    if (!state.examDate) {
      alert("수능일을 먼저 입력해주세요.");
      return;
    }
    var validSubjects = currentPlanSubjects();
    if (!validSubjects.length) {
      alert("과목명과 문제집별 총 분량을 하나 이상 입력해주세요.");
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

    validSubjects.forEach(function (subject) {
      var books = subject.books.filter(function (b) { return b.total > 0; });

      var bookRemaining = {};
      books.forEach(function (b) {
        var done = 0;
        Object.keys(state.history).forEach(function (key) {
          var entry = state.history[key][subject.id];
          if (entry && entry.newSegments) {
            entry.newSegments.forEach(function (seg) {
              if (seg.bookId === b.id && seg.done) done += seg.amount || 0;
            });
          }
        });
        bookRemaining[b.id] = Math.max(round1(b.total - done), 0);
      });

      var totalRemaining = books.reduce(function (sum, b) { return sum + bookRemaining[b.id]; }, 0);
      var dailyQuota = distributeEvenly(totalRemaining, newContentDays);

      // walk the books in list order, filling each day's quota from the
      // front of the queue so a book is fully finished before the next starts
      var queue = books
        .filter(function (b) { return bookRemaining[b.id] > 0; })
        .map(function (b) { return { id: b.id, remaining: bookRemaining[b.id] }; });

      var newSegmentsByDay = [];
      for (var i = 0; i < newContentDays; i++) {
        var q = dailyQuota[i];
        var segs = [];
        while (q > 0.001 && queue.length) {
          var cur = queue[0];
          var take = round1(Math.min(q, cur.remaining));
          if (take > 0) segs.push({ bookId: cur.id, amount: take });
          cur.remaining = round1(cur.remaining - take);
          q = round1(q - take);
          if (cur.remaining <= 0.001) queue.shift();
        }
        newSegmentsByDay.push(segs);
      }

      var reviewSegmentsByDay = [];
      for (var i2 = 0; i2 < newContentDays; i2++) {
        var srcIdx = i2 - reviewOffset;
        if (srcIdx >= 0 && srcIdx < newContentDays) {
          reviewSegmentsByDay.push(
            newSegmentsByDay[srcIdx]
              .map(function (seg) { return { bookId: seg.bookId, amount: round1(seg.amount * reviewRatio) }; })
              .filter(function (seg) { return seg.amount > 0; })
          );
        } else {
          reviewSegmentsByDay.push([]);
        }
      }

      var finalReviewByBook = {};
      books.forEach(function (b) {
        finalReviewByBook[b.id] = distributeEvenly(b.total, finalReviewDays);
      });

      for (var d = 0; d < totalStudyDays; d++) {
        var date = addDays(today, d);
        var key = dateKey(date);
        if (!state.history[key]) state.history[key] = {};
        var prev = state.history[key][subject.id];
        var prevNewDone = {};
        var prevReviewDone = {};
        if (prev && prev.newSegments) {
          prev.newSegments.forEach(function (seg) { prevNewDone[seg.bookId] = seg.done; });
        }
        if (prev && prev.reviewSegments) {
          prev.reviewSegments.forEach(function (seg) { prevReviewDone[seg.bookId] = seg.done; });
        }

        var newSegments, reviewSegments;
        if (d < newContentDays) {
          newSegments = newSegmentsByDay[d];
          reviewSegments = reviewSegmentsByDay[d];
        } else {
          newSegments = [];
          var j = d - newContentDays;
          reviewSegments = books
            .map(function (b) { return { bookId: b.id, amount: finalReviewByBook[b.id][j] || 0 }; })
            .filter(function (seg) { return seg.amount > 0; });
        }

        state.history[key][subject.id] = {
          newSegments: newSegments.map(function (seg) {
            return { bookId: seg.bookId, amount: seg.amount, done: !!prevNewDone[seg.bookId] };
          }),
          reviewSegments: reviewSegments.map(function (seg) {
            return { bookId: seg.bookId, amount: seg.amount, done: !!prevReviewDone[seg.bookId] };
          }),
        };
      }
    });

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
    subjects.forEach(function (subject) {
      var group = document.createElement("div");
      group.className = "progress-group";

      var title = document.createElement("div");
      title.className = "progress-subject-title";
      title.textContent = subject.name;
      group.appendChild(title);

      subject.books.filter(function (b) { return b.total > 0; }).forEach(function (book) {
        var done = 0;
        Object.keys(state.history).forEach(function (key) {
          var entry = state.history[key][subject.id];
          if (entry && entry.newSegments) {
            entry.newSegments.forEach(function (seg) {
              if (seg.bookId === book.id && seg.done) done += seg.amount || 0;
            });
          }
        });
        var pct = book.total > 0 ? Math.min(100, Math.round((done / book.total) * 100)) : 0;

        var item = document.createElement("div");
        item.className = "progress-item";

        var nameSpan = document.createElement("span");
        nameSpan.className = "name";
        nameSpan.textContent = book.name || "문제집";

        var bar = document.createElement("div");
        bar.className = "progress-bar";
        var fill = document.createElement("div");
        fill.className = "progress-bar-fill";
        fill.style.width = pct + "%";
        bar.appendChild(fill);

        var pctSpan = document.createElement("span");
        pctSpan.className = "pct";
        pctSpan.textContent = round1(done) + " / " + book.total + book.unit + " (" + pct + "%)";

        item.appendChild(nameSpan);
        item.appendChild(bar);
        item.appendChild(pctSpan);
        group.appendChild(item);
      });

      els.progressList.appendChild(group);
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
    var thDate = document.createElement("th");
    thDate.textContent = "날짜";
    var thDday = document.createElement("th");
    thDday.textContent = "D-day";
    headRow.appendChild(thDate);
    headRow.appendChild(thDday);
    subjects.forEach(function (s) {
      var th = document.createElement("th");
      th.textContent = s.name;
      headRow.appendChild(th);
    });
    thead.innerHTML = "";
    thead.appendChild(headRow);

    tbody.innerHTML = "";
    var checkboxHandlers = [];

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

      var tdDate = document.createElement("td");
      tdDate.className = "date-cell";
      tdDate.textContent = formatShort(date) + (isToday ? " · 오늘" : "");
      var tdDday = document.createElement("td");
      var ddayLabel = dday === 0 ? "D-DAY" : dday > 0 ? "D-" + dday : "D+" + Math.abs(dday);
      tdDday.textContent = ddayLabel;
      tr.appendChild(tdDate);
      tr.appendChild(tdDday);

      subjects.forEach(function (subject) {
        var entry = state.history[key][subject.id] || { newSegments: [], reviewSegments: [] };
        var td = document.createElement("td");
        var stack = document.createElement("div");
        stack.className = "cell-stack";

        entry.newSegments.forEach(function (seg) {
          var book = findBook(subject, seg.bookId);
          if (!book) return;
          stack.appendChild(buildTaskLabel(key, subject.id, seg, "new", book, "new-amt", ""));
        });
        entry.reviewSegments.forEach(function (seg) {
          var book = findBook(subject, seg.bookId);
          if (!book) return;
          stack.appendChild(buildTaskLabel(key, subject.id, seg, "review", book, "review-amt", "복습 "));
        });
        if (!stack.children.length) {
          var dash = document.createElement("span");
          dash.className = "review-amt";
          dash.textContent = "-";
          stack.appendChild(dash);
        }
        td.appendChild(stack);
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var key = cb.dataset.key;
        var sid = cb.dataset.sid;
        var bookId = cb.dataset.bookId;
        var segType = cb.dataset.segtype;
        var entry = state.history[key][sid];
        var arr = segType === "new" ? entry.newSegments : entry.reviewSegments;
        var seg = arr.filter(function (s) { return s.bookId === bookId; })[0];
        if (seg) seg.done = cb.checked;
        saveState();
        renderProgress();
      });
    });
  }

  function buildTaskLabel(key, subjectId, seg, segType, book, amtClass, prefix) {
    var label = document.createElement("label");
    label.className = "cell-task";

    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!seg.done;
    cb.dataset.key = key;
    cb.dataset.sid = subjectId;
    cb.dataset.bookId = seg.bookId;
    cb.dataset.segtype = segType;

    var span = document.createElement("span");
    span.className = amtClass;
    span.textContent = prefix + (book.name || "문제집") + " " + seg.amount + book.unit;

    label.appendChild(cb);
    label.appendChild(span);
    return label;
  }

  // ---------- init ----------

  render();
})();
