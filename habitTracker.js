// habitTracker.js
const DAYS_SHOWN = 30;
let db;

const request = indexedDB.open('HabitTrackerDB', 3);
request.onupgradeneeded = (event) => {
  db = event.target.result;
  if (!db.objectStoreNames.contains('habits'))
    db.createObjectStore('habits', { keyPath: 'id', autoIncrement: true });
  if (!db.objectStoreNames.contains('checks'))
    db.createObjectStore('checks', { keyPath: ['habitId', 'date'] });
};

request.onsuccess = (event) => {
  db = event.target.result;
  generateDateHeaders();
  displayGrid();
};

// ---- NEW: single source of truth for the visible date keys ----
function getDateKeys() {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // normalize to local midnight
  const keys = [];
  for (let i = DAYS_SHOWN - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    keys.push(d.toISOString().split('T')[0]); // stable YYYY-MM-DD
  }
  return keys;
}

document.getElementById('habitForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const input = document.getElementById('habitInput');
  const habit = { name: input.value, created: new Date().toISOString().split('T')[0] };
  const tx = db.transaction('habits', 'readwrite');
  tx.objectStore('habits').add(habit);
  tx.oncomplete = () => {
    input.value = '';
    // Rebuild header too, in case today changed while app was open
    generateDateHeaders();
    displayGrid();
  };
});

function generateDateHeaders() {
  const dates = getDateKeys();
  const todayStr = dates[dates.length - 1];

  const dateRow = document.getElementById('dateRow');
  dateRow.innerHTML = '<div id="habitHeader" class="habitColumn sticky left-0 bg-white z-20 px-2 border-r">Habit</div>';

  dates.forEach(dateStr => {
    // Build a local Date from parts to avoid UTC surprises
    const [y, m, d] = dateStr.split('-').map(Number);
    const local = new Date(y, m - 1, d);

    const label = `${local.toLocaleDateString(undefined, { weekday: 'short' })} (${local.getMonth() + 1}/${local.getDate()})`;

    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.textContent = label;
    cell.dataset.date = dateStr;
    if (dateStr === todayStr) cell.classList.add('today-col');

    dateRow.appendChild(cell);
  });
}

function displayGrid() {
  const tx = db.transaction('habits', 'readonly');
  const habitStore = tx.objectStore('habits');
  const habitGrid = document.getElementById('habitGrid');
  habitGrid.innerHTML = '';

  // ✅ Use the same date keys as the header
  const dates = getDateKeys();

  habitStore.getAll().onsuccess = function (e) {
    const habits = e.target.result;

    habits.forEach(habit => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'flex';

      // sticky first column with delete button + marquee
      const sticky = document.createElement('div');
      sticky.className = 'habitColumn sticky left-0 bg-white z-10 px-0 flex items-center border-r';

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn ml-1 mr-2 text-red-500';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => deleteHabit(habit.id));
      sticky.appendChild(delBtn);

      // Marquee wrapper
      const marqueeWrapper = document.createElement('div');
      marqueeWrapper.className = 'marquee-wrapper';
      const marquee = document.createElement('div');
      marquee.className = 'marquee';

      // Progress shows total active days since created
      const activeStartIdx = dates.findIndex(d => d >= habit.created);
      const activeDates = activeStartIdx >= 0 ? dates.slice(activeStartIdx) : [];

      const span1 = document.createElement('span');
      span1.textContent = `${habit.name} (${activeDates.length})`;
      const span2 = document.createElement('span');
      span2.textContent = `${habit.name} (${activeDates.length})`;
      marquee.appendChild(span1);
      marquee.appendChild(span2);
      marqueeWrapper.appendChild(marquee);
      sticky.appendChild(marqueeWrapper);

      rowDiv.appendChild(sticky);

      // Add checkbox cells
      dates.forEach(dateStr => {
        const cell = document.createElement('div');
        cell.className = 'cell';

        if (dateStr >= habit.created) {
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';

          // Restore persisted check state
          const txCheck = db.transaction('checks', 'readonly');
          txCheck.objectStore('checks').get([habit.id, dateStr]).onsuccess = ev => {
            if (ev.target.result) checkbox.checked = true;
          };

          checkbox.addEventListener('change', () => {
            const wtx = db.transaction('checks', 'readwrite');
            const store = wtx.objectStore('checks');
            if (checkbox.checked) store.put({ habitId: habit.id, date: dateStr });
            else store.delete([habit.id, dateStr]);
            // ✅ Only re-render after the write actually commits
            wtx.oncomplete = () => displayGrid();
          });

          cell.appendChild(checkbox);
        }

        rowDiv.appendChild(cell);
      });

      habitGrid.appendChild(rowDiv);
    });

    scrollToRightEdge();
  };
}

function scrollToRightEdge() {
  const wrapper = document.getElementById('gridWrapper');
  if (!wrapper) return;
  wrapper.scrollLeft = wrapper.scrollWidth - wrapper.clientWidth;
}

function deleteHabit(habitId) {
  const tx1 = db.transaction('habits', 'readwrite');
  tx1.objectStore('habits').delete(habitId);

  const tx2 = db.transaction('checks', 'readwrite');
  const store = tx2.objectStore('checks');
  const range = IDBKeyRange.bound([habitId, ''], [habitId, '\uffff']);
  const req = store.openCursor(range);
  req.onsuccess = function (e) {
    const cursor = e.target.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  // Re-render after both transactions complete
  let done = 0;
  function maybeRender() {
    done += 1;
    if (done === 2) displayGrid();
  }
  tx1.oncomplete = maybeRender;
  tx2.oncomplete = maybeRender;
}

// Drag-scroll
const wrapper = document.getElementById('gridWrapper');
let isDown = false, startX, scrollLeft;
wrapper.addEventListener('mousedown', e => {
  isDown = true;
  startX = e.pageX - wrapper.offsetLeft;
  scrollLeft = wrapper.scrollLeft;
});
wrapper.addEventListener('mouseleave', () => isDown = false);
wrapper.addEventListener('mouseup', () => isDown = false);
wrapper.addEventListener('mousemove', e => {
  if (!isDown) return;
  e.preventDefault();
  const x = e.pageX - wrapper.offsetLeft;
  const walk = (x - startX) * 2;
  wrapper.scrollLeft = scrollLeft - walk;
});

window.addEventListener('resize', () => scrollToRightEdge());
