// 求婚H5应用主逻辑
class ProposalApp {
    // DOM 加载后立即下载所有视频内容，弱网优化
    static eagerDownloadAllVideos() {
        if (!window.CONFIG || !CONFIG.assets) return;
        const videoKeys = ['scene1', 'scene2', 'scene3', 'scene4'];
        videoKeys.forEach(key => {
            const src = CONFIG.assets[key];
            if (!src) return;
            const video = document.createElement('video');
            video.src = src;
            video.preload = 'auto';
            video.style.display = 'none';
            video.muted = true;
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.setAttribute('preload', 'auto');
            document.body.appendChild(video);
            console.log(`[视频预下载] 开始下载: ${src}`);
            const onLoaded = () => {
                console.log(`[视频预下载] 下载完成: ${src}`);
                video.removeEventListener('canplaythrough', onLoaded);
                // 可选：下载完成后移除 video 节点，或保留以便后续复用
            };
            video.addEventListener('canplaythrough', onLoaded);
            // 兜底：若 30s 还没 canplaythrough 也移除监听
            setTimeout(() => {
                video.removeEventListener('canplaythrough', onLoaded);
            }, 30000);
        });
    }
    constructor() {
        this.currentScene = 0;
        this.audioContext = null;
        this.bgm = null;
        this.clickSound = null;
        this.currentVideo = null;
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
            // 视频在后台并行预加载，scene4 完成后会触发 end.mp4 的预加载
            this.preloadVideosInBackground();
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

    async preloadAssets() {
        // 这个方法已弃用：保留为空以兼容旧调用
        // 请使用 preloadAudioAssets() 和 preloadVideosInBackground()
        return;
    }

    // 仅预加载音频资源（立即返回，保证音频对象可用）
    async preloadAudioAssets() {
        // 预加载音频文件
        this.bgm = new Audio(CONFIG.assets.bgm);
        this.bgm.loop = true;
        this.bgm.volume = 0;
        this.bgm.playbackRate = 1;

        this.clickSound = new Audio(CONFIG.assets.click);
        this.clickSound.volume = 1;
        this.clickSound.playbackRate = 1;

        // 预加载 end 音效（不自动播放、初始静音）
        this.endSound = new Audio(CONFIG.assets.end);
        this.endSound.volume = 0;
        this.endSound.loop = false;

        this.questionBgm = new Audio(CONFIG.assets.questionbgm);
        this.questionBgm.loop = true;
        this.questionBgm.volume = 0;

        // 返回已完成的 Promise，以便 await 使用
        return Promise.resolve();
    }

    // 在后台并行预加载场景视频；在 scene4 完成后开始预加载 end.mp4
    preloadVideosInBackground() {
        try {
            const p1 = this.preloadVideo(CONFIG.assets.scene1);
            const p2 = this.preloadVideo(CONFIG.assets.scene2);
            const p3 = this.preloadVideo(CONFIG.assets.scene3);
            const p4 = this.preloadVideo(CONFIG.assets.scene4);
            // 当 scene4 下载完成后再开始下载 end.mp4
            p4.then(() => {
                // 开始预加载 end.mp4
                this.preloadVideo('asset/end.mp4').then(() => {
                    console.log('[视频预下载] end.mp4 已完成');
                }).catch(() => {});
            }).catch(() => {});
            // 可选：记录这些 promise
            this._videoPreloads = [p1, p2, p3, p4];
        } catch (e) {
            console.warn('预加载视频后台任务启动失败', e);
        }
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
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.src = src;
            video.preload = 'metadata';
            video.onloadedmetadata = () => resolve();
            video.onerror = () => resolve(); // 即使失败也继续
        });
    }

    setupAudio() {
        // 创建音频上下文
        if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
            this.audioContext = new(AudioContext || webkitAudioContext)();
        }
    }

    startApp() {
        this.showWelcomeScene();
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
        video.src = CONFIG.assets[scene.video];
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

        // 移除视频蒙版淡入淡出效果

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

        // 创建并播放 end 视频（不循环），播放到最后一帧时停止在最后一帧
        const endVideo = document.createElement('video');
        endVideo.className = 'video-background';
        endVideo.src = 'asset/end.mp4';
        endVideo.playsInline = true;
        endVideo.muted = true;
        endVideo.autoplay = true;
        endVideo.loop = false;
        endVideo.currentTime = 0;
        endVideo.style.zIndex = 50;
        this.appElement.appendChild(endVideo);
        endVideo.play().catch(() => {});

        // 循环播放 end 音效
        if (this.endSound) {
            try {
                this.endSound.loop = true;
                this.endSound.currentTime = 0;
                this.endSound.play().catch(() => {});
            } catch (e) {}
            const endTarget = (CONFIG.end && typeof CONFIG.end.volume === 'number') ? CONFIG.end.volume : 1;
            this.fadeInAudio(this.endSound, endTarget, CONFIG.timings.bgmFade);
        }

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

    loadScene(sceneIndex) {
        const scene = CONFIG.scenes[sceneIndex];

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
window.jumpToScene = function(n) {
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