window.CONFIG = {
    // 资源路径
    assets: {
        bgm: 'asset/bgm.mp3',
        click: 'asset/click.mp3',
        questionbgm: 'asset/questionbgm.mp3',
        end: 'asset/end.mp3',
        scene1: 'asset/scene1.mp4',
        scene2: 'asset/scene2.mp4',
        scene3: 'asset/scene3.mp4',
        scene4: 'asset/scene4.mp4',
        font: 'asset/handwriting.ttf'
    },

    // 每幕配置
    scenes: [
        // 第0幕：欢迎页
        {
            type: 'welcome',
            texts: [
                { content: '打开音效体验更佳', delay: 0, waitForClick: true },
                { content: '你好', delay: 0, waitForClick: true },
                { content: '我在此等候你多时了', delay: 0, waitForClick: true },
                { content: '请与我共赴这段旅程吧', delay: 0, waitForClick: true }
            ]
        },
        // 第1幕
        {
            type: 'question',
            video: 'scene1',
            question: '你们第一次踏在同一条小路上时，你脚下那双鞋曾经走过最多的地方是哪里？',
            options: [
                '校园雨后松软的红土田径场',
                '晚风吹来青苔香气的河边小径',
                '城市凌晨两点还亮着灯的柏油马路'
            ]
        },
        // 第2幕
        {
            type: 'question',
            video: 'scene2',
            question: '当你们一起爬上高塔，最先闪过脑海的念头是什么',
            options: [
                '曾遥不可及的地方竟已在脚下',
                '风吹得刚刚好 似乎在庆祝',
                '告诉最牵挂的人 我平安'
            ]
        },
        // 第3幕
        {
            type: 'question',
            video: 'scene3',
            question: '当平静突然坍塌，哪一瞬间你最想听到TA的声音？',
            options: [
                '发着高烧 却找不到一颗退烧药',
                '加班到深夜 末班车刚好开远',
                '突然被告知裁员的下午'
            ]
        },
        // 第4幕
        {
            type: 'question',
            video: 'scene4',
            question: '当你们终于安定下来，你最想先往客厅摆哪件小东西？',
            options: [
                '一起存钱买的第一张唱片',
                '一起旅行买来的冰箱贴',
                '用拍立得打印的合照'
            ]
        },
        // 第5幕：求婚
        {
            type: 'proposal',
            texts: [
                { content: '这些是我们一起走过的故事', delay: 2000 },
                { content: '我希望剩下的路 往后的余生', delay: 2000 },
                { content: '都能有你在侧 与你同行', delay: 2000 },
                { content: '你愿意让我成为今后每一天的固定选项吗？', delay: 2000 },
                { content: 'By 爱你的王天昊', delay: 2000 },
                { content: '记 2025年08月28日', delay: 2000 },
            ]
        }
    ],

    // 时间设置
    timings: {
        fadeIn: 1000,
        fadeOut: 1000,
        bgmFade: 2000,
        blackMask: { fadeOut: 1000, hold: 500, fadeIn: 1000 },
        textStay: 500,
        clickAnimation: 120,
        questionFadeIn: 1200, // 选择题淡入时间（当前2秒的0.6倍）
        questionFadeOut: 1200, // 选择题淡出时间（当前2秒的0.6倍）
        proposalFadeIn: 1000,
        proposalFadeOut: 1000
    },

    // 样式配置
    style: {
        bgColor: '#000000',
        textColor: '#ffffff',
        optionOverlay: 'rgba(255,255,255,0.5)',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        safeArea: true,
        fontSize: {
            title: '24px',
            question: '20px',
            option: '16px',
            text: '18px',
            proposal: '48px'
        }
    }
};

// proposal（第5幕）专属配置，便于直接在 config 中调整
CONFIG.proposal = {
    // 字体大小（CSS 字符串）
    fontSize: CONFIG.style.fontSize.proposal || '48px',
    // 第5幕文字淡入时长（毫秒）
    fadeIn: CONFIG.timings.proposalFadeIn || 2000,
    // 第5幕文字淡出时长（毫秒）
    fadeOut: CONFIG.timings.proposalFadeOut || 2000
};

// end 音效配置：默认音量为原始值的 0.5
CONFIG.end = {
    volume: 0.5
};