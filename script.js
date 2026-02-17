// --- YAPILANDIRMA ---
const CELL_SIZE = 50;

// Eşya Veritabanı (ScriptableObject gibi düşün)
const ITEM_DB = {
    'rifle':   { name: 'AK-74M',  w: 4, h: 2, weight: 3.5, color: '#5d4037' },
    'pistol':  { name: 'Glock',   w: 2, h: 1, weight: 1.2, color: '#455a64' },
    'medkit':  { name: 'Salewa',  w: 2, h: 2, weight: 0.8, color: '#c62828' },
    'ammo':    { name: '5.45x39', w: 1, h: 1, weight: 0.3, color: '#2e7d32' },
    'backpack':{ name: 'Berkut',  w: 3, h: 3, weight: 1.0, color: '#37474f', 
                 isContainer: true, capacityW: 5, capacityH: 4 }
};

// --- STATE (DURUM) ---
// Tüm eşyalar burada tutulur. 'location' hangi gridde olduğunu belirtir.
let allItems = [
    // Oyuncunun üzerindekiler
    { uid: 1, id: 'rifle',    x: 0, y: 0, location: 'grid-player', rotated: false },
    { uid: 2, id: 'medkit',   x: 5, y: 0, location: 'grid-player', rotated: false },
    
    // Yerdeki çanta ve içindeki eşya
    { uid: 3, id: 'backpack', x: 0, y: 0, location: 'grid-loot',   rotated: false },
    // Çantanın içi (Location: 'bag-{uid}')
    { uid: 4, id: 'ammo',     x: 0, y: 0, location: 'bag-3',       rotated: false } 
];

// Şu anki sürükleme işlemi verileri
let dragData = {
    active: false,
    itemUid: null,
    el: null,
    offsetX: 0,
    offsetY: 0,
    originalX: 0,
    originalY: 0,
    originalLoc: null,
    rotated: false // Sürükleme sırasındaki geçici rotasyon
};

// --- BAŞLANGIÇ ---
document.addEventListener('DOMContentLoaded', () => {
    initGrid('grid-player');
    initGrid('grid-loot');
    refreshAllGrids();
    updateTotalWeight();

    // Global Event Listeners
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('keydown', onKeyDown);
});

// --- RENDER MOTORU ---

function initGrid(elementId) {
    const el = document.getElementById(elementId);
    if(!el) return;
    const w = parseInt(el.dataset.cols) * CELL_SIZE;
    const h = parseInt(el.dataset.rows) * CELL_SIZE;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
}

function refreshAllGrids() {
    // Statik gridler
    renderGrid('grid-player');
    renderGrid('grid-loot');
    
    // Açık olan dinamik çanta gridleri
    document.querySelectorAll('.inventory-window.floating .grid-container').forEach(el => {
        renderGrid(el.id);
    });
}

function renderGrid(gridId) {
    const gridEl = document.getElementById(gridId);
    if (!gridEl) return;

    // Grid içini temizle
    gridEl.innerHTML = '';

    // Bu grid'e ait eşyaları bul
    const itemsInGrid = allItems.filter(i => i.location === gridId);

    itemsInGrid.forEach(item => {
        const db = ITEM_DB[item.id];
        const el = document.createElement('div');
        el.classList.add('item');
        el.dataset.uid = item.uid;

        // Rotasyon kontrolü
        const finalW = item.rotated ? db.h : db.w;
        const finalH = item.rotated ? db.w : db.h;

        el.style.width = `${finalW * CELL_SIZE}px`;
        el.style.height = `${finalH * CELL_SIZE}px`;
        el.style.left = `${item.x * CELL_SIZE}px`;
        el.style.top = `${item.y * CELL_SIZE}px`;
        el.style.backgroundColor = db.color;

        el.innerHTML = `<span>${db.name}</span><span class="item-subtext">${db.weight}kg</span>`;

        // Mouse Down (Sürükleme Başlat)
        el.addEventListener('mousedown', (e) => onDragStart(e, item, el));
        
        // Sağ Tık (Çanta Aç)
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if(db.isContainer) openContainerWindow(item);
        });

        gridEl.appendChild(el);
    });
}

// --- SÜRÜKLE BIRAK SİSTEMİ (TETRIS) ---

const ghostEl = document.getElementById('drag-ghost');

function onDragStart(e, item, el) {
    if (e.button !== 0) return; // Sadece sol tık

    dragData.active = true;
    dragData.itemUid = item.uid;
    dragData.el = el;
    dragData.rotated = item.rotated;
    dragData.originalLoc = item.location;
    dragData.originalX = item.x;
    dragData.originalY = item.y;

    // Mouse offset hesapla (Item'ın sol üst köşesine göre)
    const rect = el.getBoundingClientRect();
    dragData.offsetX = e.clientX - rect.left;
    dragData.offsetY = e.clientY - rect.top;

    el.classList.add('dragging');
    ghostEl.style.display = 'block';
    
    // İlk ghost güncellemesi
    updateGhost(e.clientX, e.clientY);
}

function onDragMove(e) {
    if (!dragData.active) return;
    updateGhost(e.clientX, e.clientY);
}

function updateGhost(clientX, clientY) {
    const db = ITEM_DB[allItems.find(i => i.uid === dragData.itemUid).id];
    
    // Rotasyona göre boyut
    const w = dragData.rotated ? db.h : db.w;
    const h = dragData.rotated ? db.w : db.h;
    
    // Ghost boyutlandır
    ghostEl.style.width = `${w * CELL_SIZE}px`;
    ghostEl.style.height = `${h * CELL_SIZE}px`;

    // Altındaki elementi bul
    ghostEl.style.display = 'none'; // Raycast için geçici gizle
    const elemBelow = document.elementFromPoint(clientX, clientY);
    ghostEl.style.display = 'block';

    const gridEl = elemBelow ? elemBelow.closest('.grid-container') : null;

    if (gridEl) {
        // Grid içine snap
        const gridRect = gridEl.getBoundingClientRect();
        const relX = clientX - gridRect.left - dragData.offsetX;
        const relY = clientY - gridRect.top - dragData.offsetY;

        const cellX = Math.round(relX / CELL_SIZE);
        const cellY = Math.round(relY / CELL_SIZE);

        // Ghost'u grid üzerine oturt
        ghostEl.style.left = `${gridRect.left + (cellX * CELL_SIZE)}px`;
        ghostEl.style.top = `${gridRect.top + (cellY * CELL_SIZE)}px`;

        // Validasyon
        if (isValidPlacement(gridEl, cellX, cellY, w, h, dragData.itemUid)) {
            ghostEl.className = 'item-ghost'; // Yeşil
        } else {
            ghostEl.className = 'item-ghost invalid'; // Kırmızı
        }
    } else {
        // Grid dışında serbest dolaşım
        ghostEl.style.left = `${clientX - dragData.offsetX}px`;
        ghostEl.style.top = `${clientY - dragData.offsetY}px`;
        ghostEl.className = 'item-ghost invalid';
    }
}

function onDragEnd(e) {
    if (!dragData.active) return;

    ghostEl.style.display = 'none';
    dragData.el.classList.remove('dragging');

    // Bırakılan yer grid mi?
    const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
    const gridEl = elemBelow ? elemBelow.closest('.grid-container') : null;

    if (gridEl) {
        const gridRect = gridEl.getBoundingClientRect();
        const relX = e.clientX - gridRect.left - dragData.offsetX;
        const relY = e.clientY - gridRect.top - dragData.offsetY;
        const cellX = Math.round(relX / CELL_SIZE);
        const cellY = Math.round(relY / CELL_SIZE);

        const item = allItems.find(i => i.uid === dragData.itemUid);
        const db = ITEM_DB[item.id];
        const w = dragData.rotated ? db.h : db.w;
        const h = dragData.rotated ? db.w : db.h;

        if (isValidPlacement(gridEl, cellX, cellY, w, h, dragData.itemUid)) {
            // BAŞARILI TAŞIMA
            item.location = gridEl.id;
            item.x = cellX;
            item.y = cellY;
            item.rotated = dragData.rotated; // Kalıcı rotasyonu güncelle
        }
    }

    dragData.active = false;
    refreshAllGrids();
    updateTotalWeight(); // Ağırlığı güncelle
}

// --- R (ROTATE) TUŞU ---
function onKeyDown(e) {
    if ((e.key === 'r' || e.key === 'R') && dragData.active) {
        dragData.rotated = !dragData.rotated;
        // Ghost'u güncellemek için mouse event'i olmadığı için manuel çağırıyoruz
        // Son bilinen pozisyonu tutmak gerekirdi ama basitçe şu anki ghost pozisyonunu kullanabiliriz
        // Ancak en doğrusu bir sonraki mouse hareketini beklemektir, 
        // veya force update yapmaktır. Şimdilik basit bırakalım, kullanıcı mouse oynatınca düzelir.
    }
}

// --- VALIDASYON (TETRIS MANTIĞI) ---
function isValidPlacement(gridEl, targetX, targetY, itemW, itemH, ignoreUid) {
    const cols = parseInt(gridEl.dataset.cols);
    const rows = parseInt(gridEl.dataset.rows);

    // 1. Sınırlar
    if (targetX < 0 || targetY < 0 || targetX + itemW > cols || targetY + itemH > rows) {
        return false;
    }

    // 2. Çakışmalar (Aynı griddeki diğer eşyalar)
    const itemsInGrid = allItems.filter(i => i.location === gridEl.id && i.uid !== ignoreUid);

    for (let other of itemsInGrid) {
        const odb = ITEM_DB[other.id];
        const oW = other.rotated ? odb.h : odb.w;
        const oH = other.rotated ? odb.w : odb.h;

        // AABB Collision Test
        if (targetX < other.x + oW &&
            targetX + itemW > other.x &&
            targetY < other.y + oH &&
            targetY + itemH > other.y) {
            return false;
        }
    }
    return true;
}

// --- AĞIRLIK SİSTEMİ (RECURSIVE) ---
function updateTotalWeight() {
    // Sadece 'grid-player' üzerindekileri hesapla.
    // Ancak fonksiyon recursive olduğu için çantaların içi otomatik toplanır.
    const total = calculateWeightRecursive('grid-player');
    document.getElementById('total-weight').innerText = total.toFixed(2) + " kg";
}

function calculateWeightRecursive(containerId) {
    let currentWeight = 0;
    
    // Bu container içindeki eşyaları bul
    const contents = allItems.filter(i => i.location === containerId);

    contents.forEach(item => {
        const db = ITEM_DB[item.id];
        
        // 1. Eşyanın kendi ağırlığı
        currentWeight += db.weight;

        // 2. Eğer bu eşya bir çanta ise, onun da içindeki ağırlığı topla
        if (db.isContainer) {
            // Çantanın sanal grid ID'si: "bag-" + uid
            const innerGridId = `bag-${item.uid}`;
            currentWeight += calculateWeightRecursive(innerGridId);
        }
    });

    return currentWeight;
}

// --- PENCERE SİSTEMİ (ÇANTALAR) ---

function openContainerWindow(itemInstance) {
    const bagGridId = `bag-${itemInstance.uid}`;
    
    // Zaten açıksa kapatıp tekrar açma (focus yapabilirsin ama şimdilik return)
    if (document.getElementById(`win-${itemInstance.uid}`)) return;

    const db = ITEM_DB[itemInstance.id];

    // Pencere oluştur
    const win = document.createElement('div');
    win.id = `win-${itemInstance.uid}`;
    win.className = 'inventory-window floating';
    win.style.left = '400px'; // Varsayılan açılış konumu
    win.style.top = '150px';

    // HTML İçeriği
    win.innerHTML = `
        <div class="window-header" onmousedown="dragWindow(event, '${win.id}')">
            <span>${db.name}</span>
            <span class="close-btn" onclick="closeWindow('${win.id}')">X</span>
        </div>
        <div class="grid-container" id="${bagGridId}" 
             data-cols="${db.capacityW}" data-rows="${db.capacityH}">
        </div>
    `;

    document.getElementById('floating-layer').appendChild(win);

    // Grid'i initialize et (CSS boyutlarını ver)
    initGrid(bagGridId);
    
    // İçeriği çiz
    renderGrid(bagGridId);
}

function closeWindow(winId) {
    const el = document.getElementById(winId);
    if (el) el.remove();
}

// Pencere Sürükleme Helper
function dragWindow(e, elementId) {
    const el = document.getElementById(elementId);
    const shiftX = e.clientX - el.getBoundingClientRect().left;
    const shiftY = e.clientY - el.getBoundingClientRect().top;

    function moveAt(pageX, pageY) {
        el.style.left = pageX - shiftX + 'px';
        el.style.top = pageY - shiftY + 'px';
    }

    function onMouseMove(event) {
        moveAt(event.pageX, event.pageY);
    }

    document.addEventListener('mousemove', onMouseMove);

    el.onmouseup = function() {
        document.removeEventListener('mousemove', onMouseMove);
        el.onmouseup = null;
    };
}
