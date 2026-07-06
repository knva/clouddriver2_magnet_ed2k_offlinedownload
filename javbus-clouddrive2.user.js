// ==UserScript==
// @name         JavBus 传送至 CloudDrive2 (最终版)
// @namespace    http://tampermonkey.net/
// @version      3.4
// @description  适配本地离线下载 API，支持数据行在tbody外的情况
// @author       Assistant
// @match        https://www.javbus.com/*
// @match        https://javbus.com/*
// @match        https://www.javbus.org/*
// @match        https://javbus.org/*
// @icon         https://www.google.com/s2/favicons?domain=javbus.com
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
    const MAX_RETRIES = 30;
    let refreshTimer = null;
    const autoPushedMagnets = new Set();

    // 获取所有数据行（兼容tbody内外的情况）
    function getDataRows(table) {
        // 方法1: 获取所有 tr，然后过滤掉表头行
        const allRows = table.querySelectorAll('tr');
        const dataRows = [];

        for (const row of allRows) {
            // 跳过表头行（包含 th 或者文本为"磁力名稱"的行）
            const firstCell = row.querySelector('td:first-child, th:first-child');
            if (!firstCell) continue;

            // 检查是否是表头
            const isHeader = firstCell.tagName === 'TH' ||
                            firstCell.innerText.includes('磁力名稱') ||
                            row.querySelector('th') !== null ||
                            row.style.fontWeight === 'bold';

            if (isHeader) continue;

            // 检查是否包含磁力链接
            const hasMagnet = firstCell.innerHTML.includes('magnet:') ||
                             firstCell.getAttribute('onclick')?.includes('magnet:') ||
                             firstCell.querySelector('a[href*="magnet:"]');

            if (hasMagnet) {
                dataRows.push(row);
            }
        }

        return dataRows;
    }

    // 主函数：持续尝试添加按钮
    function addButtonsContinuously() {
        const table = document.getElementById('magnet-table');

        if (table) {
            const dataRows = getDataRows(table);
            const allRows = table.querySelectorAll('tr');

            console.log(`[CD2] 找到表格，共 ${allRows.length} 行，其中数据行 ${dataRows.length} 行`);

            if (dataRows.length > 0) {
                // 有数据行，只为文件最大的行添加按钮
                refreshButtonsForRows(dataRows);
                retryCount = 0;

                // 监听后续添加的行（监听整个table的子节点变化）
                observeNewRows(table);
            } else if (retryCount < MAX_RETRIES) {
                retryCount++;
                console.log(`[CD2] 等待数据加载... (${retryCount}/${MAX_RETRIES})`);
                setTimeout(addButtonsContinuously, 500);
            } else {
                console.log('[CD2] 超时：未找到数据行');
                // 输出调试信息
                debugTableStructure(table);
            }
        } else if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`[CD2] 等待表格加载... (${retryCount}/${MAX_RETRIES})`);
            setTimeout(addButtonsContinuously, 500);
        } else {
            console.log('[CD2] 超时：未找到表格');
        }
    }

    function refreshButtonsForTable(table) {
        const dataRows = getDataRows(table);
        if (!dataRows.length) return;
        refreshButtonsForRows(dataRows);
    }

    function refreshButtonsForRows(dataRows) {
        const largestRow = getLargestRow(dataRows);
        console.log('[CD2] 已锁定最大文件行');

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

    // 调试函数：输出表格结构
    function debugTableStructure(table) {
        console.log('[CD2] 表格结构调试:');
        const allRows = table.querySelectorAll('tr');
        console.log(`[CD2] 共 ${allRows.length} 行`);
        allRows.forEach((row, idx) => {
            const firstCell = row.querySelector('td:first-child, th:first-child');
            const cellText = firstCell ? firstCell.innerText.substring(0, 50) : '无单元格';
            const hasMagnet = firstCell ? firstCell.innerHTML.includes('magnet:') : false;
            console.log(`[CD2] 行 ${idx}: ${cellText}, 包含磁力: ${hasMagnet}`);
        });
    }

    // 监听动态添加的行
    function observeNewRows(table) {
        // 标记已监听
        if (table.hasAttribute('data-cd2-observed')) return;
        table.setAttribute('data-cd2-observed', 'true');

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && (mutation.addedNodes.length || mutation.removedNodes.length)) {
                    console.log('[CD2] 检测到表格内容变化，重新计算最大文件');
                    scheduleRefresh(table);
                    break;
                }
            }
        });

        observer.observe(table, { childList: true, subtree: true });
        console.log('[CD2] 已启动行监听器');
    }

    function scheduleRefresh(table) {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => refreshButtonsForTable(table), 150);
    }

    // 同步单行按钮状态
    function syncButtonForRow(row, shouldEnable) {
        const existingBtn = row.querySelector('.cd2-transfer-btn');
        if (!shouldEnable) {
            if (existingBtn) existingBtn.remove();
            return;
        }

        if (existingBtn) return;

        const firstTd = row.querySelector('td:first-child');
        if (!firstTd) {
            console.log('[CD2] 行没有 td 元素');
            return;
        }

        // 提取磁力链接
        const magnetLink = extractMagnetLink(firstTd);
        if (!magnetLink) {
            console.log('[CD2] 未找到磁力链接，跳过此行');
            return;
        }

        // 提取文件名
        const fileName = extractFileName(firstTd);

        console.log(`[CD2] 为 "${fileName}" 添加按钮`);

        // 创建按钮
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
            e.stopPropagation();
            sendToCloudDrive2(magnetLink, fileName, btn);
        };

        firstTd.appendChild(btn);
    }

    function maybeAutoPushLargestRow(row) {
        if (!AUTO_PUSH_LARGEST) return;

        const firstTd = row.querySelector('td:first-child');
        if (!firstTd) return;

        const magnetLink = extractMagnetLink(firstTd);
        if (!magnetLink || autoPushedMagnets.has(magnetLink)) return;

        const btn = row.querySelector('.cd2-transfer-btn');
        if (!btn) return;

        const fileName = extractFileName(firstTd);
        autoPushedMagnets.add(magnetLink);
        console.log(`[CD2] 自动推送最大文件: ${fileName}`);

        sendToCloudDrive2(magnetLink, fileName, btn, {
            isAutoPush: true,
            onError: () => autoPushedMagnets.delete(magnetLink)
        });
    }

    // 提取磁力链接
    function extractMagnetLink(cell) {
        // 方法1: 从 onclick 属性提取
        let onclick = cell.getAttribute('onclick');
        if (onclick) {
            let match = onclick.match(/window\.open\('(magnet:[^']+)'/);
            if (match) return match[1];
            match = onclick.match(/window\.open\("(magnet:[^"]+)"/);
            if (match) return match[1];
        }

        // 方法2: 从 a 标签的 href 提取
        const link = cell.querySelector('a');
        if (link) {
            let href = link.getAttribute('href');
            if (href && href.startsWith('magnet:')) return href;
        }

        // 方法3: 从整个单元格的 HTML 中提取
        const html = cell.innerHTML;
        const magnetMatch = html.match(/magnet:\?[^"'\s<>]+/);
        if (magnetMatch) return magnetMatch[0];

        return null;
    }

    // 提取文件名
    function extractFileName(cell) {
        const link = cell.querySelector('a');
        if (link) {
            const text = link.textContent.trim();
            if (text) return text;
        }

        // 获取单元格文本（排除已有按钮）
        const clone = cell.cloneNode(true);
        const buttons = clone.querySelectorAll('button');
        buttons.forEach(btn => btn.remove());
        let text = clone.textContent.trim();

        if (text.length > 50) text = text.substring(0, 50);
        return text || '磁力链接任务';
    }

    // 调用本地离线下载 API
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

        console.log('[CD2] 发送请求到:', API_URL);
        console.log('[CD2] 磁力链接:', magnetLink.substring(0, 80) + '...');

        GM_xmlhttpRequest({
            method: 'POST',
            url: API_URL,
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(payload),
            timeout: 15000,
            onload: function(res) {
                console.log('[CD2] 响应状态:', res.status);
                console.log('[CD2] 响应内容:', res.responseText);

                let responseJson = null;
                try {
                    responseJson = res.responseText ? JSON.parse(res.responseText) : null;
                } catch (err) {
                    console.warn('[CD2] 响应不是合法 JSON:', err);
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
                console.error('[CD2] 请求失败:', err);
                btn.textContent = '❌';
                btn.style.backgroundColor = '#f44336';
                showToast(`❌ ${isAutoPush ? '自动推送失败: ' : ''}无法连接本地 API: 59590`, 'error');
                if (onError) onError();
                setTimeout(() => restoreButton(btn, originalText), 3000);
            },
            ontimeout: function() {
                console.error('[CD2] 请求超时');
                btn.textContent = '❌';
                btn.style.backgroundColor = '#f44336';
                showToast(`❌ ${isAutoPush ? '自动推送失败: ' : ''}请求超时`, 'error');
                if (onError) onError();
                setTimeout(() => restoreButton(btn, originalText), 3000);
            }
        });

        function restoreButton(btn, originalText) {
            if (btn.textContent !== '❌') {
                btn.textContent = originalText;
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.backgroundColor = '#ff9800';
            } else {
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.style.backgroundColor = '#ff9800';
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
        console.log('[CD2] 自动推送成功，准备关闭页面');
        try {
            window.close();
        } catch (err) {
            console.warn('[CD2] window.close() 调用失败:', err);
        }

        setTimeout(() => {
            if (!document.hidden) {
                window.open('', '_self');
                window.close();
            }
        }, 100);
    }

    // 显示提示消息
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

    // 添加调试按钮
    function addDebugButton() {
        const debugBtn = document.createElement('button');
        debugBtn.textContent = '🔍 CD2调试';
        debugBtn.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 10px;
            background: #333;
            color: #0f0;
            font-size: 11px;
            padding: 4px 8px;
            border-radius: 4px;
            z-index: 99999;
            font-family: monospace;
            cursor: pointer;
            border: 1px solid #0f0;
        `;
        debugBtn.onclick = () => {
            console.log('[CD2] 手动触发按钮添加');
            addButtonsContinuously();
            const table = document.getElementById('magnet-table');
            if (table) debugTableStructure(table);
        };
        document.body.appendChild(debugBtn);
    }

    // 启动脚本
    console.log('[CD2] 脚本已启动，等待页面加载...');

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                addButtonsContinuously();
                addDebugButton();
            }, 1000);
        });
    } else {
        setTimeout(() => {
            addButtonsContinuously();
            addDebugButton();
        }, 1000);
    }
})();
