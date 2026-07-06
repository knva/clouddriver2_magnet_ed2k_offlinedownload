// ==UserScript==
// @name         MissAV 传送至 CloudDrive2
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  missav.ws 磁力页只保留最大文件，并支持可选自动推送到 CloudDrive2
// @author       Assistant
// @match        https://missav.ws/*
// @icon         https://www.google.com/s2/favicons?domain=missav.ws
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      127.0.0.1
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ================= 配置区域 =================
    const API_URL = 'http://127.0.0.1:59590/offline-download';
    const DEFAULT_FOLDER = '/115open/javbus';
    const AUTO_PUSH_LARGEST = false;
    // ===========================================

    let retryCount = 0;
    const MAX_RETRIES = 40;
    let refreshTimer = null;
    const autoPushedMagnets = new Set();

    function addButtonsContinuously() {
        const magnetTable = findMagnetTable();

        if (magnetTable) {
            const dataRows = getDataRows(magnetTable);
            console.log(`[CD2-MissAV] 找到磁力表，数据行 ${dataRows.length} 行`);

            if (dataRows.length > 0) {
                refreshButtonsForRows(dataRows);
                retryCount = 0;
                observeTableChanges(magnetTable);
            } else if (retryCount < MAX_RETRIES) {
                retryCount++;
                console.log(`[CD2-MissAV] 等待磁力数据加载... (${retryCount}/${MAX_RETRIES})`);
                setTimeout(addButtonsContinuously, 500);
            } else {
                console.log('[CD2-MissAV] 超时：未找到磁力数据行');
            }
        } else if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`[CD2-MissAV] 等待磁力表加载... (${retryCount}/${MAX_RETRIES})`);
            setTimeout(addButtonsContinuously, 500);
        } else {
            console.log('[CD2-MissAV] 超时：未找到磁力表');
        }
    }

    function findMagnetTable() {
        const tables = document.querySelectorAll('table.min-w-full');
        for (const table of tables) {
            const magnetLink = table.querySelector('a[href^="magnet:"]');
            if (magnetLink) return table;
        }
        return null;
    }

    function getDataRows(table) {
        const rows = table.querySelectorAll('tbody tr, tr');
        return Array.from(rows).filter((row) => {
            const firstLink = row.querySelector('td:first-child a[href^="magnet:"]');
            const sizeCell = row.querySelector('td:nth-child(2)');
            return Boolean(firstLink && sizeCell);
        });
    }

    function refreshButtonsForTable(table) {
        const dataRows = getDataRows(table);
        if (!dataRows.length) return;
        refreshButtonsForRows(dataRows);
    }

    function refreshButtonsForRows(dataRows) {
        const largestRow = getLargestRow(dataRows);
        console.log('[CD2-MissAV] 已锁定最大文件行');

        dataRows.forEach((row) => {
            syncButtonForRow(row, row === largestRow);
        });

        if (largestRow) {
            maybeAutoPushLargestRow(largestRow);
        }
    }

    function getLargestRow(dataRows) {
        let maxBytes = -1;
        let largestRow = null;

        dataRows.forEach((row) => {
            const sizeBytes = parseSizeToBytes(extractSizeText(row));
            if (sizeBytes > maxBytes) {
                maxBytes = sizeBytes;
                largestRow = row;
            }
        });

        return largestRow;
    }

    function extractSizeText(row) {
        const sizeCell = row.querySelector('td:nth-child(2)');
        return sizeCell ? sizeCell.textContent.trim() : '';
    }

    function parseSizeToBytes(sizeText) {
        if (!sizeText) return 0;

        const normalized = sizeText.replace(/\s+/g, '').toUpperCase();
        const match = normalized.match(/([\d.]+)([KMGTPE]?I?B)/);
        if (!match) return 0;

        const value = Number.parseFloat(match[1]);
        if (Number.isNaN(value)) return 0;

        const unit = match[2];
        const multipliers = {
            B: 1,
            KB: 1024,
            KIB: 1024,
            MB: 1024 ** 2,
            MIB: 1024 ** 2,
            GB: 1024 ** 3,
            GIB: 1024 ** 3,
            TB: 1024 ** 4,
            TIB: 1024 ** 4,
            PB: 1024 ** 5,
            PIB: 1024 ** 5
        };

        return value * (multipliers[unit] || 1);
    }

    function observeTableChanges(table) {
        if (table.hasAttribute('data-cd2-missav-observed')) return;
        table.setAttribute('data-cd2-missav-observed', 'true');

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && (mutation.addedNodes.length || mutation.removedNodes.length)) {
                    console.log('[CD2-MissAV] 检测到表格内容变化，重新计算最大文件');
                    scheduleRefresh(table);
                    break;
                }
            }
        });

        observer.observe(table, { childList: true, subtree: true });
        console.log('[CD2-MissAV] 已启动表格监听器');
    }

    function scheduleRefresh(table) {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => refreshButtonsForTable(table), 150);
    }

    function syncButtonForRow(row, shouldEnable) {
        const existingBtn = row.querySelector('.cd2-transfer-btn');
        if (!shouldEnable) {
            if (existingBtn) existingBtn.remove();
            return;
        }

        if (existingBtn) return;

        const nameCell = row.querySelector('td:first-child');
        if (!nameCell) return;

        const magnetLink = extractMagnetLink(nameCell);
        if (!magnetLink) return;

        const fileName = extractFileName(nameCell);
        console.log(`[CD2-MissAV] 为 "${fileName}" 添加按钮`);

        const btn = document.createElement('button');
        btn.textContent = '🚀 CD2';
        btn.className = 'cd2-transfer-btn';
        btn.title = '传送至本地离线下载 API';
        Object.assign(btn.style, {
            marginLeft: '10px',
            padding: '2px 8px',
            fontSize: '11px',
            backgroundColor: '#ff9800',
            border: 'none',
            borderRadius: '3px',
            color: '#fff',
            cursor: 'pointer',
            transition: '0.2s',
            verticalAlign: 'middle'
        });

        btn.onmouseenter = () => btn.style.backgroundColor = '#f57c00';
        btn.onmouseleave = () => btn.style.backgroundColor = '#ff9800';
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            sendToCloudDrive2(magnetLink, fileName, btn);
        };

        nameCell.appendChild(btn);
    }

    function maybeAutoPushLargestRow(row) {
        if (!AUTO_PUSH_LARGEST) return;

        const nameCell = row.querySelector('td:first-child');
        if (!nameCell) return;

        const magnetLink = extractMagnetLink(nameCell);
        if (!magnetLink || autoPushedMagnets.has(magnetLink)) return;

        const btn = row.querySelector('.cd2-transfer-btn');
        if (!btn) return;

        const fileName = extractFileName(nameCell);
        autoPushedMagnets.add(magnetLink);
        console.log(`[CD2-MissAV] 自动推送最大文件: ${fileName}`);

        sendToCloudDrive2(magnetLink, fileName, btn, {
            isAutoPush: true,
            onError: () => autoPushedMagnets.delete(magnetLink)
        });
    }

    function extractMagnetLink(cell) {
        const link = cell.querySelector('a[href^="magnet:"]');
        return link ? link.getAttribute('href') : null;
    }

    function extractFileName(cell) {
        const link = cell.querySelector('a[href^="magnet:"]');
        if (!link) return '磁力链接任务';
        return link.textContent.trim() || '磁力链接任务';
    }

    function sendToCloudDrive2(magnetLink, fileName, btn, options = {}) {
        const { isAutoPush = false, onError = null } = options;
        const originalText = btn.textContent;
        btn.textContent = '⏳';
        btn.disabled = true;
        btn.style.opacity = '0.6';

        const payload = {
            magnet: magnetLink,
            directory: DEFAULT_FOLDER,
            checkFolderAfterSecs: 30
        };

        console.log('[CD2-MissAV] 发送请求到:', API_URL);
        console.log('[CD2-MissAV] 磁力链接:', magnetLink.substring(0, 80) + '...');

        GM_xmlhttpRequest({
            method: 'POST',
            url: API_URL,
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(payload),
            timeout: 15000,
            onload: function(res) {
                console.log('[CD2-MissAV] 响应状态:', res.status);
                console.log('[CD2-MissAV] 响应内容:', res.responseText);

                let responseJson = null;
                try {
                    responseJson = res.responseText ? JSON.parse(res.responseText) : null;
                } catch (err) {
                    console.warn('[CD2-MissAV] 响应不是合法 JSON:', err);
                }

                const isDuplicateTask = isDuplicateTaskResponse(responseJson);

                if ((res.status === 200 && responseJson?.success) || isDuplicateTask) {
                    btn.textContent = '✅';
                    btn.style.backgroundColor = '#4caf50';
                    const toastMessage = isDuplicateTask
                        ? `✅ ${isAutoPush ? '自动' : ''}任务已存在: ${fileName.substring(0, 30)}`
                        : `✅ ${isAutoPush ? '自动' : ''}已添加: ${fileName.substring(0, 30)}`;
                    showToast(toastMessage, 'success');
                    if (isAutoPush) {
                        setTimeout(closeCurrentPage, 800);
                    }
                    setTimeout(() => restoreButton(btn, originalText), 2000);
                } else {
                    btn.textContent = '❌';
                    btn.style.backgroundColor = '#f44336';
                    const message =
                        responseJson?.errorMessage ||
                        responseJson?.error ||
                        responseJson?.details ||
                        `失败 (${res.status})`;
                    showToast(`❌ ${isAutoPush ? '自动推送失败: ' : ''}${message}`, 'error');
                    if (onError) onError();
                    setTimeout(() => restoreButton(btn, originalText), 3000);
                }
            },
            onerror: function(err) {
                console.error('[CD2-MissAV] 请求失败:', err);
                btn.textContent = '❌';
                btn.style.backgroundColor = '#f44336';
                showToast(`❌ ${isAutoPush ? '自动推送失败: ' : ''}无法连接本地 API: 59590`, 'error');
                if (onError) onError();
                setTimeout(() => restoreButton(btn, originalText), 3000);
            },
            ontimeout: function() {
                console.error('[CD2-MissAV] 请求超时');
                btn.textContent = '❌';
                btn.style.backgroundColor = '#f44336';
                showToast(`❌ ${isAutoPush ? '自动推送失败: ' : ''}请求超时`, 'error');
                if (onError) onError();
                setTimeout(() => restoreButton(btn, originalText), 3000);
            }
        });

        function restoreButton(currentBtn, text) {
            if (currentBtn.textContent !== '❌') {
                currentBtn.textContent = text;
                currentBtn.disabled = false;
                currentBtn.style.opacity = '1';
                currentBtn.style.backgroundColor = '#ff9800';
            } else {
                setTimeout(() => {
                    currentBtn.textContent = text;
                    currentBtn.disabled = false;
                    currentBtn.style.opacity = '1';
                    currentBtn.style.backgroundColor = '#ff9800';
                }, 2000);
            }
        }
    }

    function isDuplicateTaskResponse(responseJson) {
        if (!responseJson) return false;

        const details = String(responseJson.details || '');
        const error = String(responseJson.error || '');
        return details.includes('code: 10008') ||
            details.includes('任务已存在') ||
            error.includes('任务已存在');
    }

    function closeCurrentPage() {
        console.log('[CD2-MissAV] 自动推送成功，准备关闭页面');
        try {
            window.close();
        } catch (err) {
            console.warn('[CD2-MissAV] window.close() 调用失败:', err);
        }

        setTimeout(() => {
            if (!document.hidden) {
                window.open('', '_self');
                window.close();
            }
        }, 100);
    }

    function showToast(message, type) {
        const existingToast = document.querySelector('.cd2-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'cd2-toast';
        toast.textContent = message;
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            backgroundColor: type === 'success' ? '#4caf50' : '#f44336',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: '6px',
            fontSize: '13px',
            zIndex: '99999',
            fontFamily: 'system-ui, sans-serif',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            maxWidth: '350px',
            wordBreak: 'break-all'
        });
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    console.log('[CD2-MissAV] 脚本已启动，等待页面加载...');

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(addButtonsContinuously, 1000);
        });
    } else {
        setTimeout(addButtonsContinuously, 1000);
    }
})();
