// CẤU HÌNH LIÊN KẾT CLOUD GOOGLE SHEETS MẶC ĐỊNH (KHÔNG BẮT BUỘC)
// Anh có thể dán link Web App Apps Script vào đây để khi mở web ở bất kỳ đâu/bất kỳ máy nào cũng tự động nhận link mà không cần nhập lại.
const DEFAULT_CLOUD_API_URL = 'https://script.google.com/macros/s/AKfycbzK8AL_mj3wO-tr2emPecEwVNsyPPefoXrbnXzePZxb66ZqYXjH1p-i0UrDJ27wKW1Ijw/exec';

// SIM State
let sims = [];
let selectedSimIds = new Set();
let currentFilterType = 'esim'; // 'all', 'esim', 'physical'
let currentFilterStatus = 'available'; // 'all', 'available', 'used'
let currentSortMode = 'asc'; // 'asc', 'desc', 'newest'
let searchQuery = '';

// History State
let historyLogs = [];

// Cloud Sync State
let cloudApiUrl = '';
let cloudAutoSync = false;

// Dom Elements
const simForm = document.getElementById('sim-form');
const simInput = document.getElementById('sim-input');
const simTypeRadio = document.getElementsByName('sim-type');
const simsGrid = document.getElementById('sims-grid');
const searchInput = document.getElementById('search-input');
const bulkBar = document.getElementById('bulk-bar');
const bulkInfo = document.getElementById('bulk-info');
const historyList = document.getElementById('history-list');

// Cloud Elements
const cloudApiInput = document.getElementById('cloud-api-url');
const cloudAutoCheckbox = document.getElementById('cloud-auto-sync');
const cloudStatusSpan = document.getElementById('cloud-sync-status');

// Stats Elements
const statTotalAvailable = document.getElementById('stat-total-available');
const statEsimAvailable = document.getElementById('stat-esim-available');
const statPhysicalAvailable = document.getElementById('stat-physical-available');

// Init Application
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    loadHistory();
    loadCloudSettings();
    setupEventListeners();
    render();

    // Auto sync on load if enabled
    if (cloudAutoSync && cloudApiUrl) {
        pullFromCloud(true);
    }
});

// Load data from LocalStorage
function loadData() {
    const saved = localStorage.getItem('quanlysim_data');
    if (saved) {
        try {
            sims = JSON.parse(saved);
        } catch (e) {
            console.error('Lỗi load dữ liệu:', e);
            sims = [];
        }
    } else {
        // Sample seed data: Vinaphone blank SIMs (ICCID format starts with 898402)
        sims = [
            { id: '1', number: '8984020001001234501', type: 'physical', used: false, carrier: 'vinaphone', createdAt: new Date().toISOString() },
            { id: '2', number: '8984020001001234502', type: 'physical', used: false, carrier: 'vinaphone', createdAt: new Date().toISOString() },
            { id: '3', number: '8984020001001234503', type: 'esim', used: false, carrier: 'vinaphone', createdAt: new Date().toISOString() },
            { id: '4', number: '8984020001001234504', type: 'esim', used: true, carrier: 'vinaphone', createdAt: new Date().toISOString() },
            { id: '5', number: '8984020001001234505', type: 'physical', used: false, carrier: 'vinaphone', createdAt: new Date().toISOString() }
        ];
        saveData();
    }
}

// Save data to LocalStorage
function saveData() {
    localStorage.setItem('quanlysim_data', JSON.stringify(sims));

    // Trigger auto-sync to cloud if enabled
    if (cloudAutoSync && cloudApiUrl) {
        pushToCloud(true);
    }
}

// Load Activity History
function loadHistory() {
    const saved = localStorage.getItem('quanlysim_history');
    if (saved) {
        try {
            historyLogs = JSON.parse(saved);
        } catch (e) {
            historyLogs = [];
        }
    } else {
        historyLogs = [
            { id: 'h1', desc: 'Khởi tạo hệ thống quản lý SIM trắng Vinaphone', type: 'add', timestamp: new Date().toISOString() }
        ];
        saveHistory();
    }
}

// Save Activity History
function saveHistory() {
    localStorage.setItem('quanlysim_history', JSON.stringify(historyLogs));
}

// Load Cloud Sync Settings
function loadCloudSettings() {
    cloudApiUrl = localStorage.getItem('quanlysim_cloud_url') || DEFAULT_CLOUD_API_URL;

    const autoSyncSaved = localStorage.getItem('quanlysim_cloud_auto');
    if (autoSyncSaved !== null) {
        cloudAutoSync = autoSyncSaved === 'true';
    } else {
        // Mặc định tự động đồng bộ là TRUE nếu anh đã cấu hình sẵn link mặc định trong code
        cloudAutoSync = !!DEFAULT_CLOUD_API_URL;
    }

    if (cloudApiInput) cloudApiInput.value = cloudApiUrl;
    if (cloudAutoCheckbox) cloudAutoCheckbox.checked = cloudAutoSync;

    if (cloudApiUrl) {
        cloudStatusSpan.textContent = 'Đã liên kết';
        cloudStatusSpan.style.color = '#a5b4fc';
    } else {
        cloudStatusSpan.textContent = 'Chưa liên kết';
        cloudStatusSpan.style.color = 'var(--text-muted)';
    }
}

// Save Cloud Settings
function saveCloudSettings() {
    localStorage.setItem('quanlysim_cloud_url', cloudApiUrl);
    localStorage.setItem('quanlysim_cloud_auto', cloudAutoSync);
}

// Add history item
function addLog(desc, type = 'add') {
    const newLog = {
        id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4),
        desc: desc,
        type: type,
        timestamp: new Date().toISOString()
    };

    // Add to top
    historyLogs.unshift(newLog);

    // Cap at 50 logs to preserve space
    if (historyLogs.length > 50) {
        historyLogs = historyLogs.slice(0, 50);
    }

    saveHistory();
    renderHistory();
}

// Render History Panel
function renderHistory() {
    if (!historyList) return;

    if (historyLogs.length === 0) {
        historyList.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 1rem 0;">
                Chưa có hoạt động nào được ghi lại.
            </div>
        `;
        return;
    }

    historyList.innerHTML = '';

    historyLogs.forEach(log => {
        const date = new Date(log.timestamp);
        const timeStr = date.toTimeString().slice(0, 8); // hh:mm:ss

        const item = document.createElement('div');
        item.className = 'history-item';

        let typeText = 'Thêm';
        if (log.type === 'copy') typeText = 'Copy';
        if (log.type === 'use') typeText = 'Dùng';
        if (log.type === 'delete') typeText = 'Xóa';
        if (log.type === 'clear') typeText = 'Clear';

        item.innerHTML = `
            <div class="history-content">
                <span class="history-desc">${log.desc}</span>
                <span class="history-time">${timeStr}</span>
            </div>
            <div class="history-meta">
                <span class="history-badge ${log.type}">${typeText}</span>
            </div>
        `;
        historyList.appendChild(item);
    });
}

// Show Alert Toast
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = '•';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '✗';

    toast.innerHTML = `<span style="font-weight:700;">${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Smart Range Parser Algorithm
function parseSimNumbers(rawText) {
    // Split by newlines or commas
    const lines = rawText.split(/[\n,;]+/).map(line => line.trim()).filter(line => line.length > 0);
    const parsedNumbers = [];

    for (const line of lines) {
        // Match standard ranges e.g. "8984020001001234501-10" or "1-10"
        const rangeMatch = line.match(/^([0-9]+)\s*-\s*([0-9]+)$/);

        if (rangeMatch) {
            const startStr = rangeMatch[1];
            const endStr = rangeMatch[2];

            // Expand range
            const expanded = expandRange(startStr, endStr);
            parsedNumbers.push(...expanded);
        } else {
            // Just clean the number and add it if it's alphanumeric/number digits
            const cleaned = line.replace(/[\s\.\-]/g, '');
            if (cleaned) {
                parsedNumbers.push(cleaned);
            }
        }
    }

    // De-duplicate in the current parsing batch
    return [...new Set(parsedNumbers)];
}

function expandRange(startStr, endStr) {
    // If it's a simple small index range (e.g., 1-10 or 5-20)
    if (startStr.length <= 4 && endStr.length <= 4) {
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (isNaN(start) || isNaN(end)) return [];
        const results = [];
        const step = start <= end ? 1 : -1;
        for (let i = start; start <= end ? i <= end : i >= end; i += step) {
            results.push(String(i));
        }
        return results;
    }

    // For phone numbers/ICCID (e.g. 8984020001001234501-10)
    const startNumVal = parseInt(startStr, 10);
    let endStrFull = endStr;

    // Case where endStr is short (e.g., 8984020001001234501-10) -> Replace the suffix of startStr with endStr
    if (endStr.length < startStr.length) {
        const diff = startStr.length - endStr.length;
        endStrFull = startStr.substring(0, diff) + endStr;
    }

    const endNumVal = parseInt(endStrFull, 10);
    if (isNaN(startNumVal) || isNaN(endNumVal)) return [startStr]; // Fallback to exact input if parsing fails

    const results = [];
    const length = startStr.length;
    const step = startNumVal <= endNumVal ? 1 : -1;

    let count = 0;
    for (let i = startNumVal; startNumVal <= endNumVal ? i <= endNumVal : i >= endNumVal; i += step) {
        if (count++ > 1000) { // Safety break to prevent browser crash
            showToast('Dải số quá rộng (tối đa 1000 số mỗi dải)!', 'error');
            break;
        }
        let s = String(i);
        // Pad with leading zeros if original had them
        if (s.length < length && startStr.startsWith('0')) {
            s = s.padStart(length, '0');
        }
        results.push(s);
    }
    return results;
}

// Push data to Google Sheet
function pushToCloud(isAuto = false) {
    if (!cloudApiUrl) return;

    if (cloudStatusSpan) {
        cloudStatusSpan.textContent = 'Đang lưu...';
        cloudStatusSpan.style.color = '#fcd34d';
    }

    const payload = {
        action: 'save',
        sims: sims,
        history: historyLogs
    };

    fetch(cloudApiUrl, {
        method: 'POST',
        mode: 'no-cors', // Apps script sometimes needs no-cors or redirect handling
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
        .then(() => {
            const date = new Date();
            const timeStr = date.toTimeString().slice(0, 5);
            if (cloudStatusSpan) {
                cloudStatusSpan.textContent = `Đồng bộ lúc ${timeStr}`;
                cloudStatusSpan.style.color = '#34d399';
            }
            if (!isAuto) {
                showToast('Đã đồng bộ lưu kho lên Cloud thành công!', 'success');
            }
        })
        .catch(err => {
            console.error('Lỗi đồng bộ lên:', err);
            if (cloudStatusSpan) {
                cloudStatusSpan.textContent = 'Lỗi đồng bộ';
                cloudStatusSpan.style.color = 'var(--color-used)';
            }
            if (!isAuto) {
                showToast('Lỗi gửi dữ liệu lên Google Sheets!', 'error');
            }
        });
}

// Pull data from Google Sheet
function pullFromCloud(isAuto = false) {
    if (!cloudApiUrl) {
        if (!isAuto) showToast('Vui lòng dán link API Google Sheets trước!', 'error');
        return;
    }

    if (cloudStatusSpan) {
        cloudStatusSpan.textContent = 'Đang tải...';
        cloudStatusSpan.style.color = '#fcd34d';
    }

    fetch(`${cloudApiUrl}?action=get`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                if (data.sims && Array.isArray(data.sims)) {
                    // If it is auto on load, we can merge or overwrite. Overwriting is usually expected for full cloud sync.
                    sims = data.sims;
                    if (data.history && Array.isArray(data.history)) {
                        historyLogs = data.history;
                    }

                    // Save to local
                    localStorage.setItem('quanlysim_data', JSON.stringify(sims));
                    localStorage.setItem('quanlysim_history', JSON.stringify(historyLogs));

                    render();

                    const date = new Date();
                    const timeStr = date.toTimeString().slice(0, 5);
                    if (cloudStatusSpan) {
                        cloudStatusSpan.textContent = `Đồng bộ lúc ${timeStr}`;
                        cloudStatusSpan.style.color = '#34d399';
                    }
                    showToast(isAuto ? 'Đã tự động tải dữ liệu mới từ Cloud!' : 'Tải dữ liệu từ Cloud thành công!', 'success');
                } else {
                    throw new Error('Dữ liệu không đúng định dạng');
                }
            } else {
                throw new Error(data.message || 'Lỗi API');
            }
        })
        .catch(err => {
            console.error('Lỗi tải từ cloud:', err);
            if (cloudStatusSpan) {
                cloudStatusSpan.textContent = 'Lỗi đồng bộ';
                cloudStatusSpan.style.color = 'var(--color-used)';
            }
            showToast('Không thể tải dữ liệu từ Google Sheets. Hãy kiểm tra lại cấu hình Web App!', 'error');
        });
}

// Event Listeners
function setupEventListeners() {
    // Cloud API URL input change
    cloudApiInput.addEventListener('input', (e) => {
        cloudApiUrl = e.target.value.trim();
        saveCloudSettings();
        if (cloudApiUrl) {
            cloudStatusSpan.textContent = 'Đã liên kết';
            cloudStatusSpan.style.color = '#a5b4fc';
        } else {
            cloudStatusSpan.textContent = 'Chưa liên kết';
            cloudStatusSpan.style.color = 'var(--text-muted)';
        }
    });

    // Cloud Auto Sync checkbox toggle
    cloudAutoCheckbox.addEventListener('change', (e) => {
        cloudAutoSync = e.target.checked;
        saveCloudSettings();
        if (cloudAutoSync && cloudApiUrl) {
            pushToCloud(true);
        }
    });

    // Cloud manual trigger buttons
    document.getElementById('btn-cloud-pull').addEventListener('click', () => {
        pullFromCloud(false);
    });

    document.getElementById('btn-cloud-push').addEventListener('click', () => {
        if (!cloudApiUrl) {
            showToast('Vui lòng dán link API Google Sheets trước!', 'error');
            return;
        }
        pushToCloud(false);
    });

    // Form Submit
    simForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const rawText = simInput.value.trim();
        if (!rawText) return;

        // Find selected SIM type
        let selectedType = 'physical';
        for (const radio of simTypeRadio) {
            if (radio.checked) {
                selectedType = radio.value;
                break;
            }
        }

        const parsed = parseSimNumbers(rawText);
        if (parsed.length === 0) {
            showToast('Không tìm thấy số SIM hợp lệ!', 'error');
            return;
        }

        let addedCount = 0;
        let duplicateCount = 0;

        parsed.forEach(num => {
            // Avoid duplicates
            const isDuplicate = sims.some(s => s.number === num);
            if (isDuplicate) {
                duplicateCount++;
            } else {
                sims.unshift({
                    id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
                    number: num,
                    type: selectedType,
                    used: false,
                    carrier: 'vinaphone',
                    createdAt: new Date().toISOString()
                });
                addedCount++;
            }
        });

        // Log to history before save
        if (addedCount > 0) {
            if (addedCount === 1) {
                addLog(`Đã thêm SIM trắng: ${parsed[0]} (${selectedType.toUpperCase()})`, 'add');
            } else {
                addLog(`Đã thêm dải ${addedCount} SIM trắng (${selectedType.toUpperCase()})`, 'add');
            }
        }

        saveData(); // saves and syncs automatically
        render();

        simInput.value = '';

        if (addedCount > 0) {
            showToast(`Đã thêm thành công ${addedCount} SIM trắng! ${duplicateCount > 0 ? `(Bỏ qua ${duplicateCount} SIM trùng)` : ''}`, 'success');
        } else {
            showToast(`Tất cả SIM nhập vào (${duplicateCount}) đều đã tồn tại!`, 'error');
        }
    });

    // Instant Search
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        renderList();
    });

    // Setup filter buttons
    document.querySelectorAll('.filter-btn[data-type]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn[data-type]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilterType = btn.dataset.type;
            renderList();
        });
    });

    document.querySelectorAll('.filter-btn[data-status]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn[data-status]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilterStatus = btn.dataset.status;
            renderList();
        });
    });

    // Setup sorting select dropdown
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.value = currentSortMode;
        sortSelect.addEventListener('change', (e) => {
            currentSortMode = e.target.value;
            renderList();
            const selectedText = sortSelect.options[sortSelect.selectedIndex].text;
            addLog(`Đã đổi sắp xếp: ${selectedText}`, 'copy');
        });
    }

    // Clear history log
    document.getElementById('btn-clear-history').addEventListener('click', () => {
        if (confirm('Bạn có muốn xóa sạch lịch sử hoạt động không?')) {
            historyLogs = [];
            saveHistory();
            renderHistory();
            showToast('Đã xóa sạch lịch sử hoạt động!', 'success');
        }
    });

    // Bulk actions
    document.getElementById('bulk-copy').addEventListener('click', () => {
        const selectedSims = sims.filter(s => selectedSimIds.has(s.id));
        const numbers = selectedSims.map(s => s.number).join('\n');
        navigator.clipboard.writeText(numbers).then(() => {
            showToast(`Đã copy ${selectedSims.length} số SIM vào clipboard!`, 'success');
            addLog(`Đã copy hàng loạt ${selectedSims.length} SIM trắng`, 'copy');
            clearSelection();
        });
    });

    document.getElementById('bulk-mark-used').addEventListener('click', () => {
        const count = selectedSimIds.size;
        sims.forEach(s => {
            if (selectedSimIds.has(s.id)) {
                s.used = true;
            }
        });
        addLog(`Đã đánh dấu ĐÃ DÙNG hàng loạt ${count} SIM trắng`, 'use');
        saveData();
        clearSelection();
        render();
        showToast('Đã đánh dấu đã sử dụng hàng loạt!', 'success');
    });

    document.getElementById('bulk-mark-unused').addEventListener('click', () => {
        const count = selectedSimIds.size;
        sims.forEach(s => {
            if (selectedSimIds.has(s.id)) {
                s.used = false;
            }
        });
        addLog(`Đã đánh dấu CHƯA DÙNG hàng loạt ${count} SIM trắng`, 'use');
        saveData();
        clearSelection();
        render();
        showToast('Đã đánh dấu chưa sử dụng hàng loạt!', 'success');
    });

    document.getElementById('bulk-delete').addEventListener('click', () => {
        const count = selectedSimIds.size;
        if (confirm(`Bạn có chắc chắn muốn xóa ${count} SIM đã chọn?`)) {
            sims = sims.filter(s => !selectedSimIds.has(s.id));
            addLog(`Đã xóa hàng loạt ${count} SIM trắng`, 'delete');
            saveData();
            clearSelection();
            render();
            showToast('Đã xóa các SIM đã chọn!', 'success');
        }
    });

    // Backup & Restore
    document.getElementById('btn-export').addEventListener('click', () => {
        const dataStr = JSON.stringify(sims, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

        const exportFileDefaultName = `sims_vina_backup_${new Date().toISOString().slice(0, 10)}.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        addLog('Đã xuất file sao lưu kho SIM trắng', 'copy');
        showToast('Đã xuất file dữ liệu thành công!', 'success');
    });

    document.getElementById('btn-import').addEventListener('click', () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.onchange = e => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.readAsText(file, 'UTF-8');
            reader.onload = readerEvent => {
                try {
                    const content = JSON.parse(readerEvent.target.result);
                    if (Array.isArray(content)) {
                        // Simple validation
                        const isValid = content.every(item => item.number && item.type);
                        if (isValid) {
                            if (confirm('Bạn muốn GỘP dữ liệu hiện tại hay GHI ĐÈ toàn bộ? \n\n- Click OK để GỘP dữ liệu. \n- Click Cancel để GHI ĐÈ.')) {
                                // Merge
                                let imported = 0;
                                content.forEach(item => {
                                    if (!sims.some(s => s.number === item.number)) {
                                        sims.push({
                                            id: item.id || (Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5)),
                                            number: item.number,
                                            type: item.type,
                                            used: item.used || false,
                                            carrier: 'vinaphone',
                                            createdAt: item.createdAt || new Date().toISOString()
                                        });
                                        imported++;
                                    }
                                });
                                addLog(`Đã gộp ${imported} SIM mới từ file sao lưu`, 'add');
                                showToast(`Đã gộp thành công ${imported} SIM mới!`, 'success');
                            } else {
                                // Overwrite
                                sims = content;
                                addLog(`Đã ghi đè toàn bộ kho SIM từ file sao lưu (Tổng: ${sims.length})`, 'add');
                                showToast('Đã ghi đè toàn bộ dữ liệu thành công!', 'success');
                            }
                            saveData();
                            clearSelection();
                            render();
                        } else {
                            showToast('Định dạng file backup không hợp lệ!', 'error');
                        }
                    } else {
                        showToast('Định dạng file backup không hợp lệ!', 'error');
                    }
                } catch (err) {
                    showToast('Lỗi đọc file dữ liệu!', 'error');
                }
            }
        };
        fileInput.click();
    });
}

function clearSelection() {
    selectedSimIds.clear();
    updateBulkBar();
}

// Render Dashboard Statistics
function renderStats() {
    // Kiểm tra và đếm số lượng SIM trắng sẵn có (chưa dùng)
    const availEsim = sims.filter(s => s.type === 'esim' && !s.used).length;
    const availPhysical = sims.filter(s => s.type === 'physical' && !s.used).length;
    const availTotal = availEsim + availPhysical;

    if (statTotalAvailable) statTotalAvailable.textContent = availTotal;
    if (statEsimAvailable) statEsimAvailable.textContent = availEsim;
    if (statPhysicalAvailable) statPhysicalAvailable.textContent = availPhysical;

    const warnEsim = document.getElementById('warn-esim');
    const boxEsim = document.getElementById('box-esim');
    if (warnEsim && boxEsim) {
        if (availEsim < 5) {
            warnEsim.textContent = `Sắp hết! (Còn ${availEsim})`;
            warnEsim.style.display = 'block';
            warnEsim.style.fontSize = '0.65rem';
            warnEsim.style.fontWeight = '600';
            warnEsim.style.color = 'var(--red)';
            warnEsim.style.marginTop = '0.15rem';
            boxEsim.style.borderColor = 'rgba(229, 83, 75, 0.35)';
        } else {
            warnEsim.style.display = 'none';
            boxEsim.style.borderColor = '';
        }
    }

    const warnPhysical = document.getElementById('warn-physical');
    const boxPhysical = document.getElementById('box-physical');
    if (warnPhysical && boxPhysical) {
        if (availPhysical < 5) {
            warnPhysical.textContent = `Sắp hết! (Còn ${availPhysical})`;
            warnPhysical.style.display = 'block';
            warnPhysical.style.fontSize = '0.65rem';
            warnPhysical.style.fontWeight = '600';
            warnPhysical.style.color = 'var(--red)';
            warnPhysical.style.marginTop = '0.15rem';
            boxPhysical.style.borderColor = 'rgba(229, 83, 75, 0.35)';
        } else {
            warnPhysical.style.display = 'none';
            boxPhysical.style.borderColor = '';
        }
    }
}

// Bulk bar visual update
function updateBulkBar() {
    if (selectedSimIds.size > 0) {
        bulkBar.style.display = 'flex';
        bulkInfo.textContent = `Đang chọn: ${selectedSimIds.size} SIM`;
    } else {
        bulkBar.style.display = 'none';
    }
}

// Toggle individual selection
function toggleSelectSim(id, checked) {
    if (checked) {
        selectedSimIds.add(id);
    } else {
        selectedSimIds.delete(id);
    }
    updateBulkBar();
}

// Delete SIM
function deleteSim(id) {
    const sim = sims.find(s => s.id === id);
    if (!sim) return;

    if (confirm(`Bạn có chắc muốn xóa SIM: ${sim.number}?`)) {
        const num = sim.number;
        sims = sims.filter(s => s.id !== id);
        selectedSimIds.delete(id);
        addLog(`Đã xóa SIM trắng: ${num}`, 'delete');
        saveData();
        render();
        showToast('Đã xóa SIM!', 'success');
    }
}

// Toggle Used Status
function toggleUsedStatus(id) {
    const sim = sims.find(s => s.id === id);
    if (sim) {
        sim.used = !sim.used;
        addLog(`Đã đánh dấu ${sim.used ? 'ĐÃ DÙNG' : 'CHƯA DÙNG'} SIM: ${sim.number}`, 'use');
        saveData();
        render();
        showToast(sim.used ? 'Đã đánh dấu đã sử dụng!' : 'Đã đánh dấu chưa sử dụng!', 'success');
    }
}

// Copy single SIM
function copySim(id, buttonEl, number) {
    navigator.clipboard.writeText(number).then(() => {
        buttonEl.classList.add('copied');
        buttonEl.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022z"/>
            </svg>
        `;
        addLog(`Đã copy SIM trắng: ${number}`, 'copy');
        showToast(`Đã copy số: ${number}`, 'success');

        setTimeout(() => {
            buttonEl.classList.remove('copied');
            buttonEl.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
            `;
        }, 1500);
    }).catch(err => {
        showToast('Lỗi khi copy số!', 'error');
    });
}

// Render the filtered SIM list
function renderList() {
    // Filter
    let filtered = sims.filter(s => {
        // Search Filter
        const matchesSearch = s.number.toLowerCase().includes(searchQuery.toLowerCase());

        // Type Filter
        const matchesType = currentFilterType === 'all' || s.type === currentFilterType;

        // Status Filter
        const matchesStatus = currentFilterStatus === 'all' ||
            (currentFilterStatus === 'available' && !s.used) ||
            (currentFilterStatus === 'used' && s.used);

        return matchesSearch && matchesType && matchesStatus;
    });

    // Sorting Logic
    if (currentSortMode === 'asc') {
        filtered.sort((a, b) => {
            try {
                const numA = BigInt(a.number.replace(/\D/g, ''));
                const numB = BigInt(b.number.replace(/\D/g, ''));
                return numA < numB ? -1 : (numA > numB ? 1 : 0);
            } catch (e) {
                // Alphabetical fallback
                return a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: 'base' });
            }
        });
    } else if (currentSortMode === 'desc') {
        filtered.sort((a, b) => {
            try {
                const numA = BigInt(a.number.replace(/\D/g, ''));
                const numB = BigInt(b.number.replace(/\D/g, ''));
                return numA > numB ? -1 : (numA < numB ? 1 : 0);
            } catch (e) {
                // Alphabetical fallback
                return b.number.localeCompare(a.number, undefined, { numeric: true, sensitivity: 'base' });
            }
        });
    } else if (currentSortMode === 'newest') {
        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    if (filtered.length === 0) {
        simsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div class="empty-state-title">Không tìm thấy SIM nào</div>
                <p style="font-size: 0.85rem;">Hãy điều chỉnh lại bộ lọc hoặc nhập thêm SIM mới ở bảng bên trái.</p>
            </div>
        `;
        return;
    }

    simsGrid.innerHTML = '';

    filtered.forEach(sim => {
        const isSelected = selectedSimIds.has(sim.id);
        const card = document.createElement('div');
        card.className = `sim-card animate-fade-in ${sim.used ? 'used' : ''}`;
        card.dataset.id = sim.id;

        const isEsim = sim.type === 'esim';

        card.innerHTML = `
            <div class="sim-card-header">
                <span class="carrier-badge">${formatCardDate(sim.createdAt)}</span>
                <span class="type-badge ${sim.type}">${isEsim ? 'eSIM' : 'Vật lý'}</span>
            </div>
            
            <div style="margin: 0.35rem 0;">
                <span class="sim-number-display" title="Click để copy">${formatSerialNumber(sim.number)}</span>
            </div>
            
            <div class="sim-card-actions">
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                    <label class="checkbox-container">
                        <input type="checkbox" class="sim-select-checkbox" data-id="${sim.id}" ${isSelected ? 'checked' : ''}>
                        <span class="checkbox-custom"></span>
                        <span style="font-size: 0.68rem; color: var(--text-muted);">Chọn</span>
                    </label>
                    <span class="status-toggle-text" title="Click để đổi trạng thái" style="font-size: 0.65rem; font-weight: 600; color: ${sim.used ? 'var(--red)' : 'var(--green)'}; cursor: pointer;">
                        ${sim.used ? 'Đã dùng' : 'Sẵn sàng'}
                    </span>
                </div>
                
                <div class="action-buttons" style="display: flex; gap: 0.25rem; width: 100%;">
                    <button class="action-btn copy-use-btn" title="Copy & Đánh dấu đã dùng" style="flex: 1;">Sử dụng</button>
                    <button class="action-btn copy" title="Chỉ Copy" style="flex: 1;">Copy</button>
                    <button class="action-btn delete-btn" title="Xóa SIM" style="flex: 0.8;">Xóa</button>
                </div>
            </div>
        `;

        // Add event listeners to card actions

        // Copy number by clicking the number display
        card.querySelector('.sim-number-display').addEventListener('click', (e) => {
            const copyBtn = card.querySelector('.action-btn.copy');
            copySim(sim.id, copyBtn, sim.number);
        });

        // Checkbox toggle
        card.querySelector('.sim-select-checkbox').addEventListener('change', (e) => {
            toggleSelectSim(sim.id, e.target.checked);
        });

        // Action buttons
        card.querySelector('.status-toggle-text').addEventListener('click', () => {
            toggleUsedStatus(sim.id);
        });

        card.querySelector('.action-btn.copy-use-btn').addEventListener('click', (e) => {
            copyAndUseSim(sim.id, e.currentTarget, sim.number);
        });

        card.querySelector('.action-btn.copy').addEventListener('click', (e) => {
            copySim(sim.id, e.currentTarget, sim.number);
        });

        card.querySelector('.action-btn.delete-btn').addEventListener('click', () => {
            deleteSim(sim.id);
        });

        simsGrid.appendChild(card);
    });
}

// Master Render function
function render() {
    renderStats();
    renderList();
    renderHistory();
    updateBulkBar();
}

// Định dạng dải số serial để dễ nhìn (tách khoảng trắng mỗi 4 hoặc 5 số tùy độ dài)
function formatSerialNumber(number) {
    const cleaned = number.replace(/\s/g, '');
    if (cleaned.length === 10) {
        // Ví dụ: 0987 654 321 hoặc dải 10 số
        return cleaned.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
    }
    if (cleaned.length === 19 || cleaned.length === 20) {
        // Mã ICCID SIM trắng Vinaphone: Tách mỗi 4 số
        // 8984 0200 0100 1234 501
        return cleaned.replace(/(.{4})/g, '$1 ').trim();
    }
    if (cleaned.length === 8) {
        // Ví dụ: 9312 0001
        return cleaned.replace(/(\d{4})(\d{4})/, '$1 $2');
    }
    // Mặc định tách mỗi 5 số cho dải số dài bất kỳ khác
    return cleaned.replace(/(.{5})/g, '$1 ').trim();
}

// Định dạng ngày thêm vào để hiển thị trên thẻ card
function formatCardDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// Copy và đánh dấu Đã Sử Dụng SIM đồng thời (⚡ Copy & Dùng)
function copyAndUseSim(id, buttonEl, number) {
    navigator.clipboard.writeText(number).then(() => {
        buttonEl.classList.add('copied');
        const originalText = buttonEl.innerHTML;
        buttonEl.innerHTML = `✓ Copied & Dùng`;

        // Tìm SIM và cập nhật trạng thái đã dùng
        const sim = sims.find(s => s.id === id);
        if (sim && !sim.used) {
            sim.used = true;
            addLog(`Đã copy & đánh dấu ĐÃ DÙNG SIM: ${sim.number}`, 'use');
            saveData();

            // Đợi 800ms để người dùng thấy phản hồi Copied rồi render lại cho mượt
            setTimeout(() => {
                render();
            }, 800);
        } else {
            // Nếu sim đã dùng rồi, chỉ xử lý copy bình thường
            addLog(`Đã copy SIM (đã ở trạng thái Đã Dùng): ${number}`, 'copy');
            setTimeout(() => {
                buttonEl.classList.remove('copied');
                buttonEl.innerHTML = originalText;
            }, 1200);
        }
        showToast(`Đã copy và đánh dấu ĐÃ DÙNG số: ${number}`, 'success');
    }).catch(err => {
        showToast('Lỗi khi copy số!', 'error');
    });
}
