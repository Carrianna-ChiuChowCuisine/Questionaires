// 求婚H5应用主逻辑
class ProposalApp {
    // DOM 加载后按场景顺序下载每一幕需要的所有资源（串行），每个资源开始/完成都打印日志
    static eagerDownloadAllVideos() {
        if (!window.CONFIG || !Array.isArray(CONFIG.scenes)) return;

        // 启动异步串行任务，但不阻塞调用者（调用方无需 await）
        (async() => {
            for (let i = 0; i < CONFIG.scenes.length; i++) {
                console.log(`[场景预下载] 开始第 ${i} 幕资源预下载`);
                try {
                    // 严格等待该幕所有资源完成；若有 mp4 加载失败会抛出并终止序列
                    await ProposalApp.preloadResourcesForScene(i);
                    console.log(`[场景预下载] 第 ${i} 幕所有资源已完成`);
                } catch (e) {
                    console.error(`[场景预下载] 第 ${i} 幕资源预下载失败，终止后续预下载`, e);
                    return; // 停止继续预下载后续场景
                }
            }
            // 全部场景完成后再预下载 end 资源（若存在）
        })();
    }

    // 列出某一幕需要预下载的资源（视频、背景图、选项图标等）并去重
    static _resourcesForScene(sceneIndex) {
        const resources = [];
        const scene = CONFIG.scenes[sceneIndex];
        if (!scene) return resources;

        // 优先使用 CONFIG.assets 按幕提供的资源列表（现在 CONFIG.assets 为数组，每个元素为该幕资源列表）
        if (Array.isArray(CONFIG.assets) && CONFIG.assets[sceneIndex]) {
            CONFIG.assets[sceneIndex].forEach(fname => {
                if (!fname) return;
                const p = fname.startsWith('asset/') ? fname : `asset/${fname}`;
                resources.push(p);
            });
        }

        // 兼容：若 scene 中仍指定 bg 或 optionsfont，确保包含
        if (scene.bg) {
            const bg = scene.bg.startsWith('asset/') ? scene.bg : `asset/${scene.bg}`;
            resources.push(bg);
        }
        if (Array.isArray(scene.optionsfont)) {
            scene.optionsfont.forEach(f => {
                if (!f) return;
                const p = f.startsWith('asset/') ? f : `asset/${f}`;
                resources.push(p);
            });
        }

        // 去重并返回
        return Array.from(new Set(resources));
    }

    // 在 CONFIG.assets 中查找某个文件名并返回带前缀的路径（asset/filename）
    static _findAsset(filename) {
        if (!filename) return null;
        if (!Array.isArray(CONFIG.assets)) return filename.startsWith('asset/') ? filename : `asset/${filename}`;
        for (const group of CONFIG.assets) {
            if (!Array.isArray(group)) continue;
            for (const f of group) {
                if (!f) continue;
                if (f === filename || f.endsWith(filename)) {
                    return f.startsWith('asset/') ? f : `asset/${f}`;
                }
            }
        }
        // fallback：直接加前缀
        return filename.startsWith('asset/') ? filename : `asset/${filename}`;
    }

    // 为指定场景顺序预下载资源（返回 Promise）
    static preloadResourcesForScene(sceneIndex) {
        if (!ProposalApp._scenePreloadPromises) ProposalApp._scenePreloadPromises = {};
        if (ProposalApp._scenePreloadPromises[sceneIndex]) return ProposalApp._scenePreloadPromises[sceneIndex];

        const resources = ProposalApp._resourcesForScene(sceneIndex);
        if (!resources || resources.length === 0) {
            ProposalApp._scenePreloadPromises[sceneIndex] = Promise.resolve();
            return ProposalApp._scenePreloadPromises[sceneIndex];
        }

        // 幕内资源并行下载，幕间由调用方串行控制
        const promises = resources.map(src => ProposalApp._preloadAsset(src));
        ProposalApp._scenePreloadPromises[sceneIndex] = Promise.all(promises).then(() => {
            // 记录已完成的资源集合，便于运行时快速判断
            if (!ProposalApp._preloaded) ProposalApp._preloaded = new Set();
            resources.forEach(r => ProposalApp._preloaded.add(r));
        });
        return ProposalApp._scenePreloadPromises[sceneIndex];
    }

    // 通用资源预下载：video/audio/image 等，开始/完成时打印日志
    static _preloadAsset(src) {
        return new Promise((resolve) => {
            if (!src) return resolve();

            // 规范化 src（相对路径不变）
            const url = src;
            console.log(`[预下载] 开始下载: ${url}`);

            // 视频
            if (/\.mp4(?:\?|$)/i.test(url)) {
                const video = document.createElement('video');
                video.src = url;
                video.preload = 'auto';
                video.muted = true;
                video.style.display = 'none';
                video.setAttribute('playsinline', '');
                video.setAttribute('webkit-playsinline', '');
                document.body.appendChild(video);

                let settled = false;

                const onLoaded = () => {
                    if (settled) return;
                    settled = true;
                    console.log(`[预下载] 下载完成: ${url}`);
                    video.removeEventListener('canplaythrough', onLoaded);
                    video.removeEventListener('error', onError);
                    resolve();
                };

                const onError = (ev) => {
                    if (settled) return;
                    settled = true;
                    video.removeEventListener('canplaythrough', onLoaded);
                    video.removeEventListener('error', onError);
                    console.error(`[预下载] 视频下载错误: ${url}`, ev);
                    // mp4 必须成功，否则视为失败并拒绝，以便上层停止序列
                    resolve(Promise.reject(new Error(`Video preload failed: ${url}`)));
                };

                video.addEventListener('canplaythrough', onLoaded);
                video.addEventListener('error', onError);

                // 兜底超时：若超时也视为失败，触发 reject
                const to = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    try { video.removeEventListener('canplaythrough', onLoaded); } catch (e) {}
                    try { video.removeEventListener('error', onError); } catch (e) {}
                    console.error(`[预下载] 视频预下载超时: ${url}`);
                    resolve(Promise.reject(new Error(`Video preload timeout: ${url}`)));
                }, 30000);

                return;
            }

            // 图片 / svg
            if (/\.(png|jpe?g|gif|svg)(?:\?|$)/i.test(url)) {
                const img = new Image();
                img.src = url;
                img.onload = () => {
                    console.log(`[预下载] 下载完成: ${url}`);
                    resolve();
                };
                img.onerror = () => {
                    console.warn(`[预下载] 下载失败: ${url}`);
                    resolve();
                };
                return;
            }

            // 其他（尝试用 fetch 快速触发下载，响应时认为完成）
            try {
                fetch(url, { method: 'GET', mode: 'no-cors' }).then(() => {
                    console.log(`[预下载] 下载完成(fetch): ${url}`);
                    resolve();
                }).catch(() => {
                    console.warn(`[预下载] fetch 失败: ${url}`);
                    resolve();
                });
            } catch (e) {
                console.warn(`[预下载] 无法预下载: ${url}`);
                resolve();
            }
        });
    }
    constructor() {
        this.currentScene = 0;
        this.audioContext = null;
        this.bgm = null;
        this.clickSound = null;
        // this.currentVideo = null; // 已移除：不再维护全局 currentVideo 引用
        this.isTransitioning = false;
        this.isAnimating = false; // 新增：动画状态标志
        this.appElement = document.getElementById('app');

        // 设置CSS变量
        this.setCSSVariables();

        this.init();
    }

    async init() {
        try {
            // 先预加载音频（快速），再设置音频上下文并启动应用
            await this.preloadAudioAssets();
            this.setupAudio();
            this.startApp();
            // 视频预下载由 DOMContentLoaded 时的 eagerDownloadAllVideos 负责（按幕串行）
        } catch (error) {
            console.error('初始化失败:', error);
            this.showError('加载失败，请刷新重试');
        }
    }

    setCSSVariables() {
        // 设置选择题淡入淡出时间的CSS变量
        document.documentElement.style.setProperty('--question-fade-in', CONFIG.timings.questionFadeIn + 'ms');
        document.documentElement.style.setProperty('--question-fade-out', CONFIG.timings.questionFadeOut + 'ms');
        // 设置求婚页淡入淡出时间的CSS变量
        document.documentElement.style.setProperty('--proposal-fade-in', CONFIG.timings.proposalFadeIn + 'ms');
        document.documentElement.style.setProperty('--proposal-fade-out', CONFIG.timings.proposalFadeOut + 'ms');
        // 设置求婚页字体大小
        document.documentElement.style.setProperty('--proposal-font-size', CONFIG.proposal && CONFIG.proposal.fontSize ? CONFIG.proposal.fontSize : CONFIG.style.fontSize.proposal);
        // 全局文字大小变量（可由 config.style.fontSize 覆盖）
        document.documentElement.style.setProperty('--title-font-size', (CONFIG.style && CONFIG.style.fontSize && CONFIG.style.fontSize.title) ? CONFIG.style.fontSize.title : '24px');
        document.documentElement.style.setProperty('--question-font-size', (CONFIG.style && CONFIG.style.fontSize && CONFIG.style.fontSize.question) ? CONFIG.style.fontSize.question : '20px');
        document.documentElement.style.setProperty('--option-font-size', (CONFIG.style && CONFIG.style.fontSize && CONFIG.style.fontSize.option) ? CONFIG.style.fontSize.option : '16px');
        document.documentElement.style.setProperty('--text-font-size', (CONFIG.style && CONFIG.style.fontSize && CONFIG.style.fontSize.text) ? CONFIG.style.fontSize.text : '18px');
    }

    // 仅预加载音频资源（立即返回，保证音频对象可用）
    async preloadAudioAssets() {
        // 预加载音频文件
        const bgmPath = ProposalApp._findAsset('bgm.mp3');
        const clickPath = ProposalApp._findAsset('click.mp3');
        const endPath = ProposalApp._findAsset('end.mp3');
        const questionBgmPath = ProposalApp._findAsset('questionbgm.mp3');

        this.bgm = new Audio(bgmPath);
        this.bgm.loop = true;
        this.bgm.volume = 0;
        this.bgm.playbackRate = 1;
        this.clickSound = new Audio(clickPath);
        this.clickSound.volume = 1;
        this.clickSound.playbackRate = 1;

        // 预加载 end 音效（不自动播放、初始静音）
        this.endSound = new Audio(endPath);
        this.endSound.volume = 0;
        this.endSound.loop = false;

        this.questionBgm = new Audio(questionBgmPath);
        this.questionBgm.loop = true;
        this.questionBgm.volume = 0;

        // 返回已完成的 Promise，以便 await 使用
        return Promise.resolve();
    }

    // 渐强播放任意 HTMLAudioElement（以墙钟时间为准）
    fadeInAudio(audio, targetVolume = 1, durationMs = CONFIG.timings.bgmFade) {
        if (!audio) return;
        this._cancelAudioVolumeFade(audio);
        const startVolume = Math.max(0, Math.min(1, audio.volume || 0));
        const endVolume = Math.max(0, Math.min(1, targetVolume));

        // 若 playbackRate 不为 1，需要将持续时间按 rate 缩放为墙钟时间
        const rate = Math.max(0.0001, audio.playbackRate || 1);
        const duration = Math.max(60, durationMs / rate);
        const startTime = performance.now();

        const step = () => {
            const now = performance.now();
            const t = Math.min(1, (now - startTime) / duration);
            const v = startVolume + (endVolume - startVolume) * t;
            audio.volume = v;
            if (t < 1) {
                audio._volumeFadeRAF = requestAnimationFrame(step);
            } else {
                audio._volumeFadeRAF = null;
            }
        };
        audio._volumeFadeRAF = requestAnimationFrame(step);
    }

    preloadVideo(src) {
        // 已弃用：保留兼容性占位符
        return Promise.resolve();
    }

    setupAudio() {
        // 创建音频上下文
        if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
            this.audioContext = new(AudioContext || webkitAudioContext)();
        }
    }

    startApp() {
        // 确保第0幕资源先完成预下载再展示（以获得更流畅的体验）
        (async() => {
            try {
                await ProposalApp.preloadResourcesForScene(0);
            } catch (e) {
                console.warn('第0幕资源预下载失败，仍尝试启动界面', e);
            }
            this.showWelcomeScene();
        })();
    }

    showWelcomeScene() {
        this.appElement.innerHTML = '';

        const welcomeContainer = document.createElement('div');
        welcomeContainer.className = 'welcome-container';

        const welcomeTexts = CONFIG.scenes[0].texts;
        let currentTextIndex = 0;

        const showNextText = () => {
            if (currentTextIndex >= welcomeTexts.length) {
                this.transitionToNextScene();
                return;
            }

            const textData = welcomeTexts[currentTextIndex];
            const textElement = document.createElement('div');
            textElement.className = 'text-content welcome-text';
            textElement.textContent = textData.content;

            welcomeContainer.appendChild(textElement);

            // 淡入效果
            this.isAnimating = true; // 开始动画
            setTimeout(() => {
                textElement.classList.add('fade-in');
            }, 100);

            if (textData.waitForClick) {
                // 等待点击
                const handleClick = () => {
                    // 如果正在动画中，忽略点击
                    if (this.isAnimating) return;

                    // 只在最后一段文字点击后播放click音效
                    if (currentTextIndex === 3) {
                        this.playClickSound();
                    }

                    this.isAnimating = true; // 开始淡出动画
                    textElement.classList.add('fade-out');

                    if (currentTextIndex === 0) {
                        // 第一段文字点击后播放BGM
                        this.playBGM();
                    } else if (currentTextIndex === 3) {
                        // 最后一段文字点击后减弱BGM
                        this.fadeOutBGM();
                    }

                    setTimeout(() => {
                        textElement.remove();
                        currentTextIndex++;
                        this.isAnimating = false; // 动画结束
                        showNextText();
                    }, CONFIG.timings.fadeOut);

                    document.removeEventListener('click', handleClick);
                };

                // 等待淡入动画完成后再启用点击
                setTimeout(() => {
                    this.isAnimating = false; // 淡入动画完成
                    document.addEventListener('click', handleClick, { once: true });
                }, CONFIG.timings.fadeIn + 100);

            } else {
                // 自动播放下一段
                setTimeout(() => {
                    this.isAnimating = true; // 开始淡出动画
                    textElement.classList.add('fade-out');
                    setTimeout(() => {
                        textElement.remove();
                        currentTextIndex++;
                        this.isAnimating = false; // 动画结束
                        showNextText();
                    }, CONFIG.timings.fadeOut);
                }, CONFIG.timings.textStay + textData.delay);
            }
        };

        showNextText();
        this.appElement.appendChild(welcomeContainer);
    }

    showQuestionScene(sceneIndex) {
        const scene = CONFIG.scenes[sceneIndex];
        this.appElement.innerHTML = '';

        // 背景图片
        let bgDiv = null;
        if (scene.bg) {
            bgDiv = document.createElement('div');
            bgDiv.className = 'question-bg';
            bgDiv.style.backgroundImage = `url('asset/${scene.bg}')`;
            // 明确设置过渡时长，确保与配置同步
            bgDiv.style.transition = `opacity ${CONFIG.timings.questionFadeOut}ms ease-in-out`;
            bgDiv.style.willChange = 'opacity';
            this.appElement.appendChild(bgDiv);
            // 使用类控制可见性，避免内联样式冲突
            setTimeout(() => { bgDiv.classList.add('visible'); }, 50);
        }

        // 创建问题容器
        const questionContainer = document.createElement('div');
        questionContainer.className = 'question-container';

        // 添加淡入效果
        this.isAnimating = true; // 开始淡入动画
        setTimeout(() => {
            questionContainer.classList.add('fade-in');
        }, 100);

        const questionText = document.createElement('div');
        questionText.className = 'question-text';
        questionText.textContent = scene.question;

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'options-container';

        scene.options.forEach((option, index) => {
            const optionBtn = document.createElement('button');
            optionBtn.className = 'option-btn';

            // 使用config中的svg文件作为icon
            const iconSpan = document.createElement('span');
            iconSpan.className = 'option-icon';
            if (scene.optionsfont && scene.optionsfont[index]) {
                const img = document.createElement('img');
                img.src = `asset/${scene.optionsfont[index]}`;
                img.alt = '';
                img.style.width = '32px';
                img.style.height = '32px';
                iconSpan.appendChild(img);
            }
            optionBtn.appendChild(iconSpan);

            const textSpan = document.createElement('span');
            textSpan.className = 'option-text';
            textSpan.textContent = option;
            optionBtn.appendChild(textSpan);

            optionBtn.addEventListener('click', () => {
                if (this.isAnimating) return;
                // 选项和背景一起淡出：直接淡出 questionContainer
                questionContainer.classList.add('fade-out');
                if (bgDiv) {
                    // 强制使用 inline opacity 触发过渡，确保在各种浏览器一致工作
                    bgDiv.style.transition = `opacity ${CONFIG.timings.questionFadeOut}ms ease-in-out`;
                    // remove visible class if present
                    bgDiv.classList.remove('visible');
                    // 设置为透明，触发过渡
                    setTimeout(() => { bgDiv.style.opacity = '0'; }, 10);
                }
                setTimeout(() => {
                    this.handleOptionClick(sceneIndex, index);
                }, CONFIG.timings.questionFadeOut);
            });

            optionsContainer.appendChild(optionBtn);
        });

        questionContainer.appendChild(questionText);
        questionContainer.appendChild(optionsContainer);

        // 添加视频黑色蒙版覆盖层（初始保持纯黑，直到点击选项并加载视频后再淡出）
        const videoOverlay = document.createElement('div');
        videoOverlay.className = 'video-overlay';
        this.appElement.appendChild(videoOverlay);
        this.appElement.appendChild(questionContainer);

        // 等待淡入动画完成后再启用点击
        setTimeout(() => {
            this.isAnimating = false; // 淡入动画完成
        }, CONFIG.timings.questionFadeIn + 100);

        // 停止/减弱主 BGM，改为播放问卷专用 BGM
        if (this.bgm) {
            this.fadeOutBGM();
        }
        if (this.questionBgm) {
            try {
                this.questionBgm.currentTime = 0;
                this.questionBgm.play().catch(() => {});
            } catch (e) {}
            this.fadeInAudio(this.questionBgm, 0.7, CONFIG.timings.bgmFade);
        }
    }

    handleOptionClick(sceneIndex, optionIndex) {
        // 选择题点击不播放click音效
        // 开始动画，禁用点击
        this.isAnimating = true;

        // 隐藏问题容器
        const questionContainer = document.querySelector('.question-container');
        if (questionContainer) questionContainer.classList.add('fade-out');

        // 淡出背景图片（如果有） — 由点击时已处理，这里仅确保存在时短延迟移除DOM
        const bgDiv = document.querySelector('.question-bg');
        if (bgDiv) {
            // 在稍后清理时移除
            setTimeout(() => { try { bgDiv.remove(); } catch (e) {} }, CONFIG.timings.questionFadeOut + 50);
        }

        // 减弱BGM
        // 离开问卷场景时，淡出问卷 BGM 并恢复主 BGM（如果需要）
        if (this.questionBgm) {
            this.fadeOutAudioVolume(this.questionBgm, CONFIG.timings.bgmFade);
        } else {
            this.fadeOutBGM();
        }

        // 动态创建并播放视频
        const scene = CONFIG.scenes[sceneIndex];
        const video = document.createElement('video');
        video.className = 'video-background';
        // scene.video 已含文件名（例如 scene1.mp4），按新的 config.assets 结构使用 asset/ 前缀
        video.src = scene.video && scene.video.startsWith('asset/') ? scene.video : `asset/${scene.video}`;
        video.muted = false;
        video.playsInline = true;
        video.currentTime = 0;
        video.volume = 0;

        // 将视频插入到蒙版之下
        const videoOverlay = document.querySelector('.video-overlay');
        if (videoOverlay) {
            this.appElement.insertBefore(video, videoOverlay);
        } else {
            this.appElement.appendChild(video);
        }

        // 开始播放视频
        video.play();

        // 视频音量渐强（时间精确，支持取消）
        this.fadeInVideoVolume(video);

        // 在视频结束前进行音量渐弱（带安全提前量，避免突兀）
        const fadeDurationMs = CONFIG.timings.bgmFade;
        const safetyMarginMs = 250; // 提前量，避免 timeupdate 不及时
        let hasStartedVideoFadeOut = false;

        const startFadeOutIfNeeded = (remainingMs) => {
            if (hasStartedVideoFadeOut) return;
            if (remainingMs <= fadeDurationMs + safetyMarginMs) {
                hasStartedVideoFadeOut = true;
                const duration = Math.max(150, Math.min(fadeDurationMs, Math.max(80, remainingMs - 40)));
                this.fadeOutVideoVolume(video, duration);
            }
        };

        const scheduleFadeOut = () => {
            if (!isFinite(video.duration) || video.duration <= 0) return;
            const remainingMs = Math.max(0, (video.duration - video.currentTime) * 1000);
            startFadeOutIfNeeded(remainingMs);

            const triggerAtMs = Math.max(0, (video.duration * 1000) - (fadeDurationMs + safetyMarginMs));
            const delayMs = Math.max(0, triggerAtMs - (video.currentTime * 1000));
            const timeoutId = setTimeout(() => {
                if (!hasStartedVideoFadeOut) {
                    const nowRemaining = Math.max(0, (video.duration - video.currentTime) * 1000);
                    startFadeOutIfNeeded(nowRemaining);
                }
            }, delayMs);

            const clear = () => {
                clearTimeout(timeoutId);
                video.removeEventListener('ended', clear);
                video.removeEventListener('pause', clear);
            };
            video.addEventListener('ended', clear);
            video.addEventListener('pause', clear);
        };

        const onLoadedMetadata = () => {
            scheduleFadeOut();
        };
        video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });

        // 兜底：timeupdate 检查剩余时间
        const onTimeUpdate = () => {
            if (!isFinite(video.duration) || video.duration <= 0) return;
            const remainingMs = Math.max(0, (video.duration - video.currentTime) * 1000);
            startFadeOutIfNeeded(remainingMs);
        };
        video.addEventListener('timeupdate', onTimeUpdate);

        // 监听视频结束
        video.addEventListener('ended', () => {
            // 若仍有音量且未开始淡出，进行快速收尾，避免突兀
            if (video.volume > 0.02 && !hasStartedVideoFadeOut) {
                this.fadeOutVideoVolume(video, 180);
            } else {
                video.volume = 0;
            }
            video.removeEventListener('timeupdate', onTimeUpdate);
            this.transitionToNextScene();
        });

        // 移除问题容器
        setTimeout(() => {
            questionContainer.remove();
            this.isAnimating = false; // 动画结束，重新启用点击
        }, CONFIG.timings.questionFadeOut);
    }

    showProposalScene() {
        // 第5幕：直接播放 end 视频与循环音效（不展示文字）
        this.appElement.innerHTML = '';

        // 停止/减弱其他 BGM
        this.fadeOutBGM();
        if (this.questionBgm) this.fadeOutAudioVolume(this.questionBgm, CONFIG.timings.bgmFade);

        // 创建 end 视频与音效，并尝试在两者都就绪后同时开始播放以保证同步
        const endVideo = document.createElement('video');
        endVideo.className = 'video-background';
        endVideo.src = (CONFIG.scenes && CONFIG.scenes[5] && CONFIG.scenes[5].video) ? (CONFIG.scenes[5].video.startsWith('asset/') ? CONFIG.scenes[5].video : `asset/${CONFIG.scenes[5].video}`) : 'asset/end.mp4';
        endVideo.playsInline = true;
        endVideo.muted = true; // 保持静音以增加 autoplay 成功率
        endVideo.autoplay = false; // 我们将通过代码在准备好后一并调用 play()
        endVideo.loop = false;
        endVideo.currentTime = 0;
        endVideo.style.zIndex = 50;
        this.appElement.appendChild(endVideo);

        const audio = this.endSound || null;

        // 等待视频就绪（canplaythrough）
        const waitVideoReady = new Promise((resolve, reject) => {
            let settled = false;
            const onLoaded = () => { if (settled) return;
                settled = true;
                cleanup();
                resolve(); };
            const onError = (e) => { if (settled) return;
                settled = true;
                cleanup();
                reject(new Error('endVideo error')); };
            const to = setTimeout(() => { if (settled) return;
                settled = true;
                cleanup();
                reject(new Error('endVideo timeout')); }, 30000);

            function cleanup() { try { endVideo.removeEventListener('canplaythrough', onLoaded); } catch (e) {} try { endVideo.removeEventListener('error', onError); } catch (e) {}
                clearTimeout(to); }
            endVideo.addEventListener('canplaythrough', onLoaded);
            endVideo.addEventListener('error', onError);
        });

        // 等待音频就绪（若不存在则立即通过）
        const waitAudioReady = new Promise((resolve) => {
            if (!audio) return resolve();
            if (audio.readyState >= 3) return resolve();
            const onCan = () => { cleanup();
                resolve(); };
            const to = setTimeout(() => { cleanup();
                resolve(); }, 5000); // 小超时后继续（best-effort）
            function cleanup() { try { audio.removeEventListener('canplaythrough', onCan); } catch (e) {}
                clearTimeout(to); }
            audio.addEventListener('canplaythrough', onCan);
        });

        // 当两者就绪后同时启动播放（尽量同步）
        Promise.all([waitVideoReady, waitAudioReady]).then(async() => {
            // 尝试同时播放视频和音频
            try {
                const playPromises = [endVideo.play()];
                if (audio) {
                    try {
                        audio.loop = true;
                        audio.currentTime = 0;
                    } catch (e) {}
                    playPromises.push(audio.play());
                }
                // 并发调用 play()
                await Promise.all(playPromises.map(p => p && p.catch ? p.catch(err => { throw err; }) : p));
            } catch (err) {
                // 有时音频会因浏览器策略被拒绝播放；在此情况下继续播放视频，稍后可在用户交互时重试播放音频
                console.warn('end media play rejected, attempting video-only start', err);
                try { endVideo.play().catch(() => {}); } catch (e) {}
            }

            // 若音频已成功开始，淡入音量
            if (audio && audio.volume === 0) {
                const endTarget = (CONFIG.end && typeof CONFIG.end.volume === 'number') ? CONFIG.end.volume : 1;
                this.fadeInAudio(audio, endTarget, CONFIG.timings.bgmFade);
            }
        }).catch((e) => {
            console.error('end media readiness failed, starting what is available', e);
            // 尝试至少播放视频
            try { endVideo.play().catch(() => {}); } catch (err) {}
            if (audio) {
                try { audio.play().catch(() => {}); } catch (err) {}
            }
        });

        // 当视频接近结束时，暂停在最后一帧并保持画面
        const onTimeUpdate = () => {
            if (!isFinite(endVideo.duration) || endVideo.duration <= 0) return;
            const remaining = endVideo.duration - endVideo.currentTime;
            if (remaining <= 0.05) {
                try {
                    endVideo.pause();
                    // 尝试定位到最后一帧
                    endVideo.currentTime = Math.max(0, endVideo.duration - 0.02);
                } catch (e) {}
                endVideo.removeEventListener('timeupdate', onTimeUpdate);
            }
        };
        endVideo.addEventListener('timeupdate', onTimeUpdate);
    }

    transitionToNextScene() {
        if (this.isTransitioning) return;
        this.isTransitioning = true;
        this.isAnimating = true; // 开始场景切换动画

        // 创建黑色蒙版
        const blackMask = document.createElement('div');
        blackMask.className = 'black-mask';
        this.appElement.appendChild(blackMask);

        // 先淡入到黑（1s）
        setTimeout(() => {
            blackMask.classList.add('fade-in');
        }, 100);

        // 等待淡入完成后切换场景
        setTimeout(() => {
            // 加载下一幕
            this.currentScene++;
            if (this.currentScene < CONFIG.scenes.length) {
                this.loadScene(this.currentScene);
            }

            // 立即开始淡出黑幕（1s），露出新场景
            setTimeout(() => {
                blackMask.classList.add('fade-out');

                // 淡出完成后移除蒙版并重置状态
                setTimeout(() => {
                    blackMask.remove();
                    this.isTransitioning = false;
                    this.isAnimating = false; // 场景切换动画结束
                }, CONFIG.timings.blackMask.fadeOut);
            }, 0);
        }, CONFIG.timings.blackMask.fadeIn);
    }

    async loadScene(sceneIndex) {
        const scene = CONFIG.scenes[sceneIndex];

        // 在展示场景前，确保该场景资源已完成预下载
        try {
            await ProposalApp.preloadResourcesForScene(sceneIndex);
        } catch (e) {
            console.error(`加载场景 ${sceneIndex} 的资源失败，无法进入该场景`, e);
            this.showError('资源加载失败，请刷新重试');
            return;
        }

        if (scene.type === 'question') {
            this.showQuestionScene(sceneIndex);
        } else if (scene.type === 'proposal') {
            this.showProposalScene();
        }
    }

    playBGM() {
        if (this.bgm) {
            this.bgm.play();
            this.fadeInBGM();
        }
    }

    fadeInBGM() {
        if (this.bgm) {
            this.bgm.volume = 0;
            this.bgm.play();

            let volume = 0;
            const targetVolume = 0.7;
            const step = targetVolume / (CONFIG.timings.bgmFade / 32);

            const fadeIn = () => {
                volume = Math.min(volume + step, targetVolume);
                this.bgm.volume = volume;

                if (volume < targetVolume) {
                    requestAnimationFrame(fadeIn);
                }
            };

            fadeIn();
        }
    }

    fadeOutBGM() {
        if (this.bgm) {
            let volume = this.bgm.volume;
            const step = volume / (CONFIG.timings.bgmFade / 32);

            const fadeOut = () => {
                volume = Math.max(volume - step, 0);
                this.bgm.volume = volume;

                if (volume > 0) {
                    requestAnimationFrame(fadeOut);
                } else {
                    this.bgm.pause();
                }
            };

            fadeOut();
        }
    }

    // 使用时间驱动的线性淡入，避免帧率波动
    fadeInVideoVolume(video) {
        this._cancelVideoVolumeFade(video);
        const startVolume = Math.max(0, Math.min(1, video.volume || 0));
        const endVolume = 1;
        const durationMs = CONFIG.timings.bgmFade;
        const startTime = performance.now();

        const step = () => {
            const now = performance.now();
            const t = Math.min(1, (now - startTime) / durationMs);
            const v = startVolume + (endVolume - startVolume) * t;
            video.volume = v;
            if (t < 1) {
                video._volumeFadeRAF = requestAnimationFrame(step);
            } else {
                video._volumeFadeRAF = null;
            }
        };
        video._volumeFadeRAF = requestAnimationFrame(step);
    }

    // 使用时间驱动的线性淡出，支持自定义时长
    fadeOutVideoVolume(video, durationMs) {
        this._cancelVideoVolumeFade(video);
        const startVolume = Math.max(0, Math.min(1, video.volume || 0));
        const endVolume = 0;
        const duration = Math.max(100, durationMs || CONFIG.timings.bgmFade);
        const startTime = performance.now();

        const step = () => {
            const now = performance.now();
            const t = Math.min(1, (now - startTime) / duration);
            const v = startVolume + (endVolume - startVolume) * t;
            video.volume = v;
            if (t < 1) {
                video._volumeFadeRAF = requestAnimationFrame(step);
            } else {
                video._volumeFadeRAF = null;
            }
        };
        video._volumeFadeRAF = requestAnimationFrame(step);
    }

    _cancelVideoVolumeFade(video) {
        if (video && video._volumeFadeRAF) {
            cancelAnimationFrame(video._volumeFadeRAF);
            video._volumeFadeRAF = null;
        }
    }

    // 使用时间驱动的线性淡出（通用音频）
    fadeOutAudioVolume(audio, durationMs) {
        if (!audio) return;
        if (audio._volumeFadeRAF) {
            cancelAnimationFrame(audio._volumeFadeRAF);
            audio._volumeFadeRAF = null;
        }
        const startVolume = Math.max(0, Math.min(1, audio.volume || 0));
        const endVolume = 0;
        const duration = Math.max(60, durationMs || CONFIG.timings.bgmFade);
        const startTime = performance.now();

        const step = () => {
            const now = performance.now();
            const t = Math.min(1, (now - startTime) / duration);
            const v = startVolume + (endVolume - startVolume) * t;
            audio.volume = v;
            if (t < 1) {
                audio._volumeFadeRAF = requestAnimationFrame(step);
            } else {
                audio._volumeFadeRAF = null;
            }
        };
        audio._volumeFadeRAF = requestAnimationFrame(step);
    }

    // 取消通用音频音量渐变
    _cancelAudioVolumeFade(audio) {
        if (audio && audio._volumeFadeRAF) {
            cancelAnimationFrame(audio._volumeFadeRAF);
            audio._volumeFadeRAF = null;
        }
    }

    playClickSound() {
        if (this.clickSound) {
            const audio = this.clickSound;
            this._cancelAudioVolumeFade(audio);
            audio.currentTime = 0;
            // 立即以 100% 开始播放，并线性在剩余播放时长内淡到 0（按墙钟时间，考虑 playbackRate）
            audio.volume = 1;
            audio.play();

            const rate = Math.max(0.0001, audio.playbackRate || 1);
            if (isFinite(audio.duration) && audio.duration > 0) {
                const remainingMs = Math.max(0, (audio.duration - audio.currentTime) * 1000 / rate);
                this.fadeOutAudioVolume(audio, Math.max(60, remainingMs));
            } else {
                // 若未知时长，则使用默认淡出时长
                this.fadeOutAudioVolume(audio, CONFIG.timings.bgmFade);
            }

            // 确保播放结束时音量为 0
            audio.addEventListener('ended', () => {
                audio.volume = 0;
            }, { once: true });
        }
    }

    showError(message) {
        this.appElement.innerHTML = `<div class="loading">${message}</div>`;
    }
}


// 应用启动
document.addEventListener('DOMContentLoaded', () => {
    // 弱网优化：DOM加载后立即预下载所有视频内容
    ProposalApp.eagerDownloadAllVideos();
    window.proposalApp = new ProposalApp();
});

// 开发/调试：在控制台中调用 window.jumpToScene(n) 可直接跳转到第 n 幕（0 计数）
window.goto = function(n) {
    const app = window.proposalApp;
    if (!app) return console.warn('app 未初始化');
    if (typeof n !== 'number' || n < 0 || n >= CONFIG.scenes.length) return console.warn('scene index invalid');
    app.currentScene = n;
    app.loadScene(n);
    console.info(`jumped to scene ${n}`);
};

// 全局点击事件拦截器，防止动画期间被点击打断
document.addEventListener('click', (e) => {
    const app = window.proposalApp;
    if (app && app.isAnimating) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
}, true);

// 防止页面滚动
document.addEventListener('touchmove', (e) => {
    e.preventDefault();
}, { passive: false });

// 防止双击缩放
document.addEventListener('dblclick', (e) => {
    e.preventDefault();
});