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

document.getElementById('habitForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const input = document.getElementById('habitInput');
  const habit = { name: input.value, created: new Date().toISOString().split('T')[0] };
  const tx = db.transaction('habits', 'readwrite');
  tx.objectStore('habits').add(habit).onsuccess = () => {
    input.value = '';
    displayGrid();
  };
});

function generateDateHeaders() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const dateRow = document.getElementById('dateRow');
  dateRow.innerHTML = '<div id="habitHeader" class="habitColumn sticky left-0 bg-white z-20 px-2 border-r">Habit</div>';

  for (let i = DAYS_SHOWN - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const label = `${date.toLocaleDateString(undefined, { weekday: 'short' })} (${date.getMonth()+1}/${date.getDate()})`;

    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.textContent = label;
    if (date.toISOString().split('T')[0] === todayStr) cell.classList.add('today-col');

    dateRow.appendChild(cell);
  }
}

function displayGrid() {
  const tx = db.transaction('habits', 'readonly');
  const habitStore = tx.objectStore('habits');
  const habitGrid = document.getElementById('habitGrid');
  habitGrid.innerHTML = '';

  const today = new Date();
  const dates = Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (DAYS_SHOWN - 1 - i));
    return d.toISOString().split('T')[0];
  });

  habitStore.getAll().onsuccess = function (e) {
    const habits = e.target.result;

    habits.forEach(habit => {
      const habitStartIndex = dates.findIndex(date => date >= habit.created);
      const activeDates = habitStartIndex >= 0 ? dates.slice(habitStartIndex) : [];

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

      // Add two spans to repeat text for seamless scroll
      const span1 = document.createElement('span');
      span1.textContent = `${habit.name} (${activeDates.length})`;
      const span2 = document.createElement('span');
      span2.textContent = `${habit.name} (${activeDates.length})`;

      marquee.appendChild(span1);
      marquee.appendChild(span2);
      marqueeWrapper.appendChild(marquee);
      sticky.appendChild(marqueeWrapper);

      rowDiv.appendChild(sticky);

      // Add checkboxes
      dates.forEach(dateStr => {
        const cell = document.createElement('div');
        cell.className = 'cell';

        if (dateStr >= habit.created) {
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';

          const txCheck = db.transaction('checks', 'readonly');
          txCheck.objectStore('checks').get([habit.id, dateStr]).onsuccess = e => {
            if (e.target.result) checkbox.checked = true;
          };

          checkbox.addEventListener('change', () => {
            const tx = db.transaction('checks', 'readwrite');
            const store = tx.objectStore('checks');
            if (checkbox.checked) store.put({ habitId: habit.id, date: dateStr });
            else store.delete([habit.id, dateStr]);
            displayGrid();
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
  setTimeout(() => { displayGrid(); }, 50);
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
