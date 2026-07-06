// ==UserScript==
// @name         磁力链接提取器
// @namespace    http://tampermonkey.net/
// @version      2026-06-09
// @description  提取磁力链接并推送到 CD2 离线下载，推送前自动去重
// @author       You
// @match        *.btdig.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=btdig.com
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==

(function() {
    'use strict';

    const API_URL = 'http://127.0.0.1:59590/offline-download';
    const DEFAULT_FOLDER = '/115open/javbus';
    const KEYWORD_FILTER = '1080p';

    const button = document.createElement('div');
    button.innerHTML = '🔗 提取磁力';
    button.id = 'magnet-extractor-btn';
    Object.assign(button.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: '9999',
        backgroundColor: '#4CAF50',
        color: 'white',
        padding: '10px 15px',
        borderRadius: '30px',
        cursor: 'pointer',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        fontWeight: 'bold',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        transition: 'all 0.3s ease',
        border: 'none'
    });

    button.onmouseover = () => {
        button.style.backgroundColor = '#45a049';
        button.style.transform = 'scale(1.05)';
    };
    button.onmouseout = () => {
        button.style.backgroundColor = '#4CAF50';
        button.style.transform = 'scale(1)';
    };

    const panel = document.createElement('div');
    panel.id = 'magnet-panel';
    Object.assign(panel.style, {
        position: 'fixed',
        bottom: '80px',
        right: '20px',
        width: '450px',
        maxHeight: '550px',
        backgroundColor: 'white',
        border: '1px solid #ccc',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        zIndex: '9998',
        display: 'none',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'Arial, sans-serif'
    });

    const panelHeader = document.createElement('div');
    Object.assign(panelHeader.style, {
        padding: '10px 15px',
        backgroundColor: '#f5f5f5',
        borderBottom: '1px solid #ddd',
        cursor: 'move',
        fontWeight: 'bold',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    });
    panelHeader.innerHTML = '<span>📋 磁力链接列表</span><span id="magnet-close" style="cursor:pointer; font-size:20px;">&times;</span>';

    const panelContent = document.createElement('div');
    Object.assign(panelContent.style, {
        padding: '10px',
        overflowY: 'auto',
        flex: '1'
    });

    const panelFooter = document.createElement('div');
    Object.assign(panelFooter.style, {
        padding: '8px 15px',
        backgroundColor: '#f9f9f9',
        borderTop: '1px solid #eee',
        fontSize: '12px',
        color: '#666',
        display: 'flex',
        justifyContent: 'space-between'
    });

    panel.appendChild(panelHeader);
    panel.appendChild(panelContent);
    panel.appendChild(panelFooter);
    document.body.appendChild(panel);

    document.getElementById('magnet-close').onclick = () => {
        panel.style.display = 'none';
    };

    function normalizeFileName(name) {
        return String(name || '')
            .replace(/\s+/g, ' ')
            .replace(/[\\/:*?"<>|]+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function normalizeKeyword(keyword) {
        return String(keyword || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function decodeHtml(value) {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = value;
        return textarea.value;
    }

    function cleanDisplayText(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .replace(/^\s*&nbsp;\s*/i, '')
            .trim();
    }

    function decodeDnFromMagnet(link) {
        try {
            const normalized = decodeHtml(link);
            const query = normalized.includes('?') ? normalized.split('?')[1] : '';
            const params = new URLSearchParams(query);
            const dn = params.get('dn');
            return dn ? cleanDisplayText(decodeURIComponent(dn)) : '';
        } catch (err) {
            return '';
        }
    }

    function extractHashFromMagnet(link) {
        const hashMatch = link.match(/btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/);
        return hashMatch ? hashMatch[1] : '';
    }

    function extractItemFromResultNode(node) {
        const magnetAnchor = node.querySelector('.torrent_magnet a[href^="magnet:"], a[href^="magnet:"]');
        if (!magnetAnchor) return null;

        const link = magnetAnchor.getAttribute('href');
        if (!link) return null;

        const fileNode = node.querySelector('.torrent_excerpt .fa-file-video-o');
        const titleNode = node.querySelector('.torrent_name a, .torrent_name');
        const folderNode = node.querySelector('.torrent_excerpt .fa-folder-open');
        const dnName = decodeDnFromMagnet(link);

        let fileName = '';
        if (fileNode) {
            fileName = cleanDisplayText(fileNode.textContent);
        }
        if (!fileName && titleNode) {
            fileName = cleanDisplayText(titleNode.textContent);
        }
        if (!fileName) {
            fileName = dnName;
        }
        if (!fileName) {
            fileName = extractHashFromMagnet(link) || '磁力链接任务';
        }

        const hash = extractHashFromMagnet(link);
        const titleText = titleNode ? cleanDisplayText(titleNode.textContent) : '';
        const folderText = folderNode ? cleanDisplayText(folderNode.textContent) : '';
        const searchText = normalizeFileName([fileName, titleText, folderText, dnName].filter(Boolean).join(' '));

        return {
            link,
            fileName,
            normalizedName: normalizeFileName(fileName),
            searchText,
            hash
        };
    }

    function findDisplayNameForMagnet(link) {
        const exactAnchor = document.querySelector(`a[href="${CSS.escape(link)}"]`);
        const row = exactAnchor ? exactAnchor.closest('.one_result, tr, .card, .media, .item') : null;
        if (row) {
            const item = extractItemFromResultNode(row);
            if (item?.fileName) return item.fileName;
        }

        return decodeDnFromMagnet(link) || extractHashFromMagnet(link) || '磁力链接任务';
    }

    function extractMagnetLinks() {
        const keyword = normalizeKeyword(KEYWORD_FILTER);
        const seenFileNames = new Set();
        const uniqueItems = [];
        const dedupedItems = [];
        const keywordFilteredItems = [];
        const seenLinks = new Set();

        const resultNodes = document.querySelectorAll('.one_result');
        resultNodes.forEach((node) => {
            const item = extractItemFromResultNode(node);
            if (!item || seenLinks.has(item.link)) return;
            seenLinks.add(item.link);

            if (keyword && !item.searchText.includes(keyword)) {
                keywordFilteredItems.push(item);
                return;
            }

            if (item.normalizedName && seenFileNames.has(item.normalizedName)) {
                dedupedItems.push(item);
                return;
            }

            if (item.normalizedName) {
                seenFileNames.add(item.normalizedName);
            }
            uniqueItems.push(item);
        });

        if (!uniqueItems.length) {
            const magnetAnchors = document.querySelectorAll('a[href^="magnet:"]');
            magnetAnchors.forEach((anchor) => {
                const link = anchor.getAttribute('href');
                if (!link || seenLinks.has(link)) return;
                seenLinks.add(link);

                const fileName = findDisplayNameForMagnet(link);
                const normalizedName = normalizeFileName(fileName);
                const hash = extractHashFromMagnet(link);
                const searchText = normalizeFileName([fileName, decodeDnFromMagnet(link)].filter(Boolean).join(' '));
                const item = { link, fileName, normalizedName, searchText, hash };

                if (keyword && !searchText.includes(keyword)) {
                    keywordFilteredItems.push(item);
                    return;
                }

                if (normalizedName && seenFileNames.has(normalizedName)) {
                    dedupedItems.push(item);
                    return;
                }

                if (normalizedName) {
                    seenFileNames.add(normalizedName);
                }
                uniqueItems.push(item);
            });
        }

        if (uniqueItems.length === 0) {
            panelContent.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">❌ 未找到有效的磁力链接<br><span style="font-size:11px;">要求完整40位哈希值或32位Base32格式</span></div>';
            panelFooter.innerHTML = '<span>📭 共 0 个链接</span><span></span>';
        } else {
            let linksHtml = '<ul style="list-style:none;padding:0;margin:0;">';
            uniqueItems.forEach((item, index) => {
                const link = item.link;
                const hash = item.hash;
                const fileName = item.fileName;

                linksHtml += `
                    <li style="margin-bottom:12px;border-bottom:1px solid #eee;padding-bottom:8px;">
                        <div style="word-break:break-all;font-family:monospace;font-size:11px;margin-bottom:5px;color:#333;">
                            <span style="color:#4CAF50;font-weight:bold;">🔗 链接 ${index + 1}</span>
                        </div>
                        <div style="font-size:12px;font-weight:bold;margin-bottom:6px;color:#222;">
                            📄 ${escapeHtml(fileName)}
                        </div>
                        <div style="word-break:break-all;font-family:monospace;font-size:11px;margin-bottom:8px;background:#f5f5f5;padding:5px;border-radius:3px;">
                            ${escapeHtml(link)}
                        </div>
                        <div style="font-size:11px;color:#666;margin-bottom:8px;">
                            📌 哈希: ${hash.substring(0, 16)}...${hash.substring(hash.length - 8)}
                        </div>
                        <div>
                            <button class="magnet-copy-btn" data-link="${escapeAttr(link)}" style="background:#2196F3;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;margin-right:8px;font-size:12px;">📋 复制链接</button>
                            <button class="magnet-copy-hash" data-hash="${escapeAttr(hash)}" style="background:#FF9800;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;margin-right:8px;font-size:12px;">🔑 复制Hash</button>
                            <button class="magnet-push-btn" data-link="${escapeAttr(link)}" data-name="${escapeAttr(fileName)}" style="background:#4CAF50;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;margin-right:8px;font-size:12px;">🚀 推送CD2</button>
                            <a href="${escapeHtml(link)}" target="_blank" style="color:#4CAF50;text-decoration:none;font-size:12px;">🌐 打开链接</a>
                        </div>
                    </li>
                `;
            });
            linksHtml += '</ul>';
            panelContent.innerHTML = linksHtml;

            panelFooter.innerHTML = `<span>✅ 保留 ${uniqueItems.length} 个链接，关键词 "${escapeHtml(KEYWORD_FILTER)}" 过滤 ${keywordFilteredItems.length} 个，按文件名去重 ${dedupedItems.length} 个</span>
                                     <div>
                                         <button id="magnet-push-all-links" style="background:#4CAF50;color:white;border:none;padding:3px 10px;border-radius:4px;cursor:pointer;margin-right:5px;font-size:11px;">推送全部到CD2</button>
                                         <button id="magnet-copy-all-links" style="background:#607D8B;color:white;border:none;padding:3px 10px;border-radius:4px;cursor:pointer;margin-right:5px;font-size:11px;">复制全部链接</button>
                                         <button id="magnet-copy-all-hashes" style="background:#FF9800;color:white;border:none;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:11px;">复制全部Hash</button>
                                     </div>`;

            document.querySelectorAll('.magnet-copy-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const link = btn.getAttribute('data-link');
                    copyToClipboard(link);
                    const originalText = btn.innerText;
                    btn.innerText = '✓ 已复制!';
                    setTimeout(() => { btn.innerText = originalText; }, 1500);
                });
            });

            document.querySelectorAll('.magnet-copy-hash').forEach(btn => {
                btn.addEventListener('click', () => {
                    const hash = btn.getAttribute('data-hash');
                    copyToClipboard(hash);
                    const originalText = btn.innerText;
                    btn.innerText = '✓ Hash已复制!';
                    setTimeout(() => { btn.innerText = originalText; }, 1500);
                });
            });

            document.querySelectorAll('.magnet-push-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const link = btn.getAttribute('data-link');
                    const name = btn.getAttribute('data-name') || '磁力链接任务';
                    pushToCd2(link, name, btn);
                });
            });

            const copyAllLinksBtn = document.getElementById('magnet-copy-all-links');
            if (copyAllLinksBtn) {
                copyAllLinksBtn.addEventListener('click', () => {
                    const allLinks = uniqueItems.map(item => item.link).join('\n');
                    copyToClipboard(allLinks);
                    copyAllLinksBtn.innerText = '✓ 已复制!';
                    setTimeout(() => { copyAllLinksBtn.innerText = '复制全部链接'; }, 2000);
                });
            }

            const copyAllHashesBtn = document.getElementById('magnet-copy-all-hashes');
            if (copyAllHashesBtn) {
                copyAllHashesBtn.addEventListener('click', () => {
                    const allHashes = uniqueItems.map(item => item.hash).filter(Boolean);
                    copyToClipboard(allHashes.join('\n'));
                    copyAllHashesBtn.innerText = '✓ Hash已复制!';
                    setTimeout(() => { copyAllHashesBtn.innerText = '复制全部Hash'; }, 2000);
                });
            }

            const pushAllBtn = document.getElementById('magnet-push-all-links');
            if (pushAllBtn) {
                pushAllBtn.addEventListener('click', () => {
                    pushAllLinks(uniqueItems, pushAllBtn);
                });
            }
        }

        panel.style.display = 'flex';
    }

    function escapeHtml(str) {
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    function escapeAttr(str) {
        return String(str).replace(/[&<>"']/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            if (m === '"') return '&quot;';
            if (m === "'") return '&#39;';
            return m;
        });
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => {
                fallbackCopy(text);
            });
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }

    function pushToCd2(link, fileName, buttonEl) {
        const originalText = buttonEl.innerText;
        buttonEl.innerText = '⏳ 推送中';
        buttonEl.disabled = true;

        GM_xmlhttpRequest({
            method: 'POST',
            url: API_URL,
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                magnet: link,
                directory: DEFAULT_FOLDER,
                checkFolderAfterSecs: 30
            }),
            timeout: 20000,
            onload: function(res) {
                let payload = null;
                try {
                    payload = res.responseText ? JSON.parse(res.responseText) : null;
                } catch (err) {
                    console.warn('[CD2] 响应不是合法 JSON:', err);
                }

                if (res.status === 200 && payload?.success) {
                    buttonEl.innerText = '✓ 已推送';
                    buttonEl.style.backgroundColor = '#4CAF50';
                    showToast(`✓ 已推送到 CD2: ${fileName}`, 'success');
                } else {
                    const message =
                        payload?.errorMessage ||
                        payload?.error ||
                        payload?.details ||
                        `HTTP ${res.status}`;
                    buttonEl.innerText = '✗ 推送失败';
                    buttonEl.style.backgroundColor = '#F44336';
                    showToast(`✗ 推送失败: ${message}`, 'error');
                }

                setTimeout(() => {
                    buttonEl.innerText = originalText;
                    buttonEl.disabled = false;
                    buttonEl.style.backgroundColor = '#4CAF50';
                }, 2200);
            },
            onerror: function() {
                buttonEl.innerText = '✗ 推送失败';
                buttonEl.style.backgroundColor = '#F44336';
                showToast('✗ 无法连接本地 CD2 API', 'error');
                setTimeout(() => {
                    buttonEl.innerText = originalText;
                    buttonEl.disabled = false;
                    buttonEl.style.backgroundColor = '#4CAF50';
                }, 2200);
            },
            ontimeout: function() {
                buttonEl.innerText = '✗ 请求超时';
                buttonEl.style.backgroundColor = '#F44336';
                showToast('✗ 推送超时', 'error');
                setTimeout(() => {
                    buttonEl.innerText = originalText;
                    buttonEl.disabled = false;
                    buttonEl.style.backgroundColor = '#4CAF50';
                }, 2200);
            }
        });
    }

    function pushAllLinks(items, buttonEl) {
        const originalText = buttonEl.innerText;
        let index = 0;
        let pushed = 0;
        let failed = 0;

        buttonEl.innerText = '推送中...';
        buttonEl.disabled = true;

        const runNext = () => {
            if (index >= items.length) {
                buttonEl.innerText = originalText;
                buttonEl.disabled = false;
                showToast(`批量完成: 推送 ${pushed}，失败 ${failed}`, failed ? 'error' : 'success');
                return;
            }

            const item = items[index];
            const link = item.link;
            index += 1;
            buttonEl.innerText = `推送中 ${index}/${items.length}`;

            GM_xmlhttpRequest({
                method: 'POST',
                url: API_URL,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({
                    magnet: link,
                    directory: DEFAULT_FOLDER,
                    checkFolderAfterSecs: 30
                }),
                timeout: 20000,
                onload: function(res) {
                    let payload = null;
                    try {
                        payload = res.responseText ? JSON.parse(res.responseText) : null;
                    } catch (err) {
                        console.warn('[CD2] 批量推送响应不是合法 JSON:', err);
                    }

                    if (res.status === 200 && payload?.success) {
                        pushed += 1;
                    } else {
                        failed += 1;
                    }

                    runNext();
                },
                onerror: function() {
                    failed += 1;
                    runNext();
                },
                ontimeout: function() {
                    failed += 1;
                    runNext();
                }
            });
        };

        runNext();
    }

    function showToast(message, type) {
        const existingToast = document.querySelector('.magnet-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'magnet-toast';
        toast.textContent = message;
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            zIndex: '10000',
            backgroundColor: type === 'success' ? '#4CAF50' : '#F44336',
            color: 'white',
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
        });
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 2500);
    }

    button.onclick = (e) => {
        e.stopPropagation();
        extractMagnetLinks();
    };

    document.addEventListener('click', (e) => {
        if (panel.style.display === 'flex' && !panel.contains(e.target) && e.target !== button) {
            panel.style.display = 'none';
        }
    });

    document.body.appendChild(button);

    let isDragging = false;
    let offsetX;
    let offsetY;

    panelHeader.addEventListener('mousedown', (e) => {
        if (e.target.id !== 'magnet-close') {
            isDragging = true;
            offsetX = e.clientX - panel.offsetLeft;
            offsetY = e.clientY - panel.offsetTop;
            panel.style.position = 'fixed';
            panel.style.bottom = 'auto';
            panel.style.right = 'auto';
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            panel.style.left = (e.clientX - offsetX) + 'px';
            panel.style.top = (e.clientY - offsetY) + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
})();
