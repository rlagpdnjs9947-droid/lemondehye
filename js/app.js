(function () {
  "use strict";

  var STORAGE_KEY = "suneung-planner-state-v2";
  var LEGACY_STORAGE_KEY = "suneung-planner-state-v1";

  var els = {
    subjectList: document.getElementById("subject-list"),
    addSubject: document.getElementById("add-subject"),
    generatePlan: document.getElementById("generate-plan"),
    checklistCard: document.getElementById("checklist-card"),
    checklistList: document.getElementById("checklist-list"),
    emptyMessage: document.getElementById("empty-message"),
  };

  var state = loadState();

  function defaultState() {
    return {
      subjects: [
        { id: uid(), name: "", books: [{ id: uid(), name: "", total: null, unit: "쪽", blockCount: null, blocks: [] }] },
      ],
    };
  }

  function uid() {
    return "id" + Math.random().toString(36).slice(2, 10);
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.subjects) && parsed.subjects.length) {
          sanitizeState(parsed);
          return parsed;
        }
      }
      var legacy = migrateFromLegacy();
      return legacy || defaultState();
    } catch (e) {
      return defaultState();
    }
  }

  function sanitizeState(parsed) {
    parsed.subjects.forEach(function (s) {
      if (!Array.isArray(s.books)) s.books = [];
      s.books.forEach(function (b) {
        if (!Array.isArray(b.blocks)) b.blocks = [];
      });
    });
  }

  // one-time upgrade from the old date/calendar-based schema: carries over
  // subject/book names, totals and units, and seeds each book's completed
  // amount from any previously-checked daily segments so progress isn't lost.
  function migrateFromLegacy() {
    try {
      var raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return null;
      var v1 = JSON.parse(raw);
      if (!v1 || !Array.isArray(v1.subjects)) return null;

      var subjects = v1.subjects.map(function (s) {
        var books = Array.isArray(s.books) && s.books.length
          ? s.books
          : [{ id: uid(), name: s.name || "문제집 1", total: s.total != null ? s.total : null, unit: s.unit || "쪽" }];

        return {
          id: s.id || uid(),
          name: s.name || "",
          books: books.map(function (b) {
            var done = 0;
            var history = v1.history || {};
            Object.keys(history).forEach(function (key) {
              var entry = history[key] && history[key][s.id];
              if (entry && entry.newSegments) {
                entry.newSegments.forEach(function (seg) {
                  if (seg.bookId === b.id && seg.done) done += seg.amount || 0;
                });
              }
            });
            return {
              id: b.id || uid(),
              name: b.name || "",
              total: b.total != null ? b.total : null,
              unit: b.unit || "쪽",
              blockCount: null,
              blocks: [],
              carriedDone: done > 0 ? Math.round(done * 10) / 10 : 0,
            };
          }),
        };
      });

      return { subjects: subjects };
    } catch (e) {
      return null;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // storage unavailable; ignore
    }
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

    var addBookBtn = document.createElement("button");
    addBookBtn.type = "button";
    addBookBtn.className = "btn secondary add-book-btn";
    addBookBtn.textContent = "+ 문제집 추가";
    addBookBtn.addEventListener("click", function () {
      subject.books.push({ id: uid(), name: "", total: null, unit: "쪽", blockCount: null, blocks: [] });
      saveState();
      renderSubjects();
    });
    group.appendChild(addBookBtn);

    return group;
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

    var blockCountInput = document.createElement("input");
    blockCountInput.type = "number";
    blockCountInput.className = "book-block-count";
    blockCountInput.placeholder = "블록 수";
    blockCountInput.min = "1";
    blockCountInput.step = "1";
    blockCountInput.title = "총 분량을 몇 개의 블록으로 나눌지";
    blockCountInput.value = book.blockCount === null || book.blockCount === undefined ? "" : book.blockCount;
    blockCountInput.addEventListener("input", function () {
      var v = parseInt(blockCountInput.value, 10);
      book.blockCount = isNaN(v) || v < 1 ? null : v;
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
    row.appendChild(blockCountInput);
    row.appendChild(removeBtn);
    return row;
  }

  els.addSubject.addEventListener("click", function () {
    state.subjects.push({ id: uid(), name: "", books: [{ id: uid(), name: "", total: null, unit: "쪽", blockCount: null, blocks: [] }] });
    saveState();
    renderSubjects();
  });

  // ---------- block generation ----------

  function currentPlanSubjects() {
    return state.subjects.filter(function (s) {
      return s.name && s.books.some(function (b) { return b.blocks && b.blocks.length; });
    });
  }

  function generatePlan() {
    var eligibleBooks = 0;
    state.subjects.forEach(function (subject) {
      if (!subject.name) return;
      subject.books.forEach(function (book) {
        if (!(book.total > 0) || !(book.blockCount > 0)) {
          book.blocks = [];
          return;
        }
        eligibleBooks++;

        var previousDone = book.blocks
          ? book.blocks.reduce(function (sum, blk) { return blk.done ? sum + blk.amount : sum; }, 0)
          : 0;
        if (book.carriedDone) previousDone = Math.max(previousDone, book.carriedDone);

        var amounts = distributeEvenly(book.total, book.blockCount);
        var cumulative = 0;
        book.blocks = amounts.map(function (amt) {
          cumulative = round1(cumulative + amt);
          return { amount: amt, done: cumulative <= previousDone + 0.001 };
        });
        delete book.carriedDone;
      });
    });

    if (!eligibleBooks) {
      alert("과목명, 문제집 총 분량, 블록 수를 모두 입력해주세요.");
      return;
    }

    saveState();
    render();
  }

  els.generatePlan.addEventListener("click", generatePlan);

  // ---------- rendering ----------

  function hasPlan() {
    return currentPlanSubjects().length > 0;
  }

  function render() {
    renderSubjects();

    if (!hasPlan()) {
      els.checklistCard.hidden = true;
      els.emptyMessage.hidden = false;
      return;
    }

    els.emptyMessage.hidden = true;
    els.checklistCard.hidden = false;
    renderChecklist();
  }

  function renderChecklist() {
    els.checklistList.innerHTML = "";
    currentPlanSubjects().forEach(function (subject) {
      var books = subject.books.filter(function (b) { return b.blocks && b.blocks.length; });
      if (!books.length) return;

      var subjDiv = document.createElement("div");
      subjDiv.className = "subject-checklist";

      var title = document.createElement("div");
      title.className = "subject-checklist-title";
      title.textContent = subject.name;
      subjDiv.appendChild(title);

      books.forEach(function (book) {
        subjDiv.appendChild(buildBookChecklist(subject, book));
      });

      els.checklistList.appendChild(subjDiv);
    });
  }

  function buildBookChecklist(subject, book) {
    var wrap = document.createElement("div");
    wrap.className = "book-checklist";

    var done = book.blocks.reduce(function (sum, blk) { return blk.done ? sum + blk.amount : sum; }, 0);
    var pct = book.total > 0 ? Math.min(100, Math.round((done / book.total) * 100)) : 0;
    var remaining = Math.max(round1(book.total - done), 0);

    var header = document.createElement("div");
    header.className = "book-checklist-header";
    var nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = book.name || "문제집";
    var statSpan = document.createElement("span");
    statSpan.className = "pct";
    statSpan.textContent = "남은 " + remaining + book.unit + " / 총 " + book.total + book.unit + " (" + pct + "%)";
    header.appendChild(nameSpan);
    header.appendChild(statSpan);
    wrap.appendChild(header);

    var bar = document.createElement("div");
    bar.className = "progress-bar";
    var fill = document.createElement("div");
    fill.className = "progress-bar-fill";
    fill.style.width = pct + "%";
    bar.appendChild(fill);
    wrap.appendChild(bar);

    var grid = document.createElement("div");
    grid.className = "block-grid";
    book.blocks.forEach(function (block, idx) {
      var chip = document.createElement("label");
      chip.className = "block-chip" + (block.done ? " done" : "");

      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!block.done;
      cb.addEventListener("change", function () {
        block.done = cb.checked;
        saveState();
        renderChecklist();
      });

      var span = document.createElement("span");
      span.textContent = (idx + 1) + ") " + block.amount + book.unit;

      chip.appendChild(cb);
      chip.appendChild(span);
      grid.appendChild(chip);
    });
    wrap.appendChild(grid);

    return wrap;
  }

  // ---------- init ----------

  render();
})();
