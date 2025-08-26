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
            await this.preloadAssets();
            this.setupAudio();
            this.startApp();
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
    }

    async preloadAssets() {
        // 预加载音频文件
        this.bgm = new Audio(CONFIG.assets.bgm);
        this.bgm.loop = true;
        this.bgm.volume = 0;
        // 播放速度设为 0.7 倍
        this.bgm.playbackRate = 1;

        this.clickSound = new Audio(CONFIG.assets.click);
        // 点击音效初始音量设为 100%
        this.clickSound.volume = 1;
        // 点击音效播放速度设为 0.7 倍
        this.clickSound.playbackRate = 1;

        // 预加载 end 音效
        this.endSound = new Audio(CONFIG.assets.end);
        this.endSound.volume = 0;
        // end 音效不循环，按正常速率播放

        // 预加载问卷 BGM
        this.questionBgm = new Audio(CONFIG.assets.questionbgm);
        this.questionBgm.loop = true;
        this.questionBgm.volume = 0;

        // 预加载视频文件
        const videoPromises = [
            this.preloadVideo(CONFIG.assets.scene1),
            this.preloadVideo(CONFIG.assets.scene2),
            this.preloadVideo(CONFIG.assets.scene3),
            this.preloadVideo(CONFIG.assets.scene4)
        ];

        await Promise.all(videoPromises);
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

        // 延迟创建视频：在选项点击后再创建与加载

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
            optionBtn.textContent = option;

            optionBtn.addEventListener('click', () => {
                // 如果正在动画中，忽略点击
                if (this.isAnimating) return;
                this.handleOptionClick(sceneIndex, index);
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
        questionContainer.classList.add('fade-out');

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
        this.appElement.innerHTML = '';

        // 减弱全局音量
        this.fadeOutBGM();

        const proposalContainer = document.createElement('div');
        proposalContainer.className = 'proposal-container';

        const proposalTexts = CONFIG.scenes[5].texts;
        let currentTextIndex = 0;

        const showNextText = () => {
            if (currentTextIndex >= proposalTexts.length) {
                return;
            }

            const textData = proposalTexts[currentTextIndex];
            const textElement = document.createElement('div');
            textElement.className = 'proposal-text';
            textElement.textContent = textData.content;

            proposalContainer.appendChild(textElement);

            // 淡入效果
            this.isAnimating = true; // 开始淡入动画
            const propFadeIn = (CONFIG.proposal && CONFIG.proposal.fadeIn) || CONFIG.timings.proposalFadeIn;
            const propFadeOut = (CONFIG.proposal && CONFIG.proposal.fadeOut) || CONFIG.timings.proposalFadeOut;
            setTimeout(() => {
                textElement.classList.add('fade-in');
            }, textData.delay || 0);

            // 在第一段文字出现时，播放 end 音效并渐强
            if (currentTextIndex === 0 && this.endSound) {
                try {
                    this.endSound.currentTime = 0;
                    this.endSound.play().catch(() => {});
                } catch (e) {}
                const endTarget = (CONFIG.end && typeof CONFIG.end.volume === 'number') ? CONFIG.end.volume : 1;
                this.fadeInAudio(this.endSound, endTarget, CONFIG.timings.bgmFade);
            }

            const isLast = currentTextIndex === proposalTexts.length - 1;

            if (!isLast) {
                // 第4句（index === 3）要求用户点击屏幕才继续，其他文本自动淡出
                if (currentTextIndex === 3) {
                    // 在淡入完成后启用点击监听
                    setTimeout(() => {
                        // 允许点击触发下一步
                        this.isAnimating = false;
                        const handleScreenClick = () => {
                            if (this.isAnimating) return;
                            this.isAnimating = true; // 开始淡出动画
                            textElement.classList.add('fade-out');
                            setTimeout(() => {
                                textElement.remove();
                                currentTextIndex++;
                                this.isAnimating = false; // 动画结束
                                showNextText();
                            }, propFadeOut);
                            document.removeEventListener('click', handleScreenClick);
                        };

                        document.addEventListener('click', handleScreenClick, { once: true });
                    }, (textData.delay || 0) + propFadeIn + 50);
                } else {
                    // 前几段文字自动淡出
                    setTimeout(() => {
                        this.isAnimating = true; // 开始淡出动画
                        textElement.classList.add('fade-out');
                        setTimeout(() => {
                            textElement.remove();
                            currentTextIndex++;
                            this.isAnimating = false; // 动画结束
                            showNextText();
                        }, propFadeOut);
                    }, (textData.delay || 0) + CONFIG.timings.textStay + propFadeIn);
                }
            } else {
                // 最后一段仅淡入并保持展示，结束整体流程
                setTimeout(() => {
                    this.isAnimating = false; // 淡入动画完成
                    // 停止后续场景切换逻辑
                    this.isTransitioning = true;
                }, (textData.delay || 0) + propFadeIn + 100);
            }
        };

        showNextText();
        this.appElement.appendChild(proposalContainer);
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