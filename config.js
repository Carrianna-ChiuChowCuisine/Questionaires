window.CONFIG = {
    // 资源路径
    assets: [
        ['bgm.mp3', 'click.mp3', 'questionbgm.mp3'],
        ['Q1bg.jpg', 'Q1_1.svg', 'Q1_2.svg', 'Q1_3.svg', 'scene1.mp4'],
        ['Q2bg.jpg', 'Q2_1.svg', 'Q2_2.svg', 'Q2_3.svg', 'scene2.mp4'],
        ['Q3bg.jpg', 'Q3_1.svg', 'Q3_2.svg', 'Q3_3.svg', 'scene3.mp4'],
        ['Q4bg.jpg', 'Q4_1.svg', 'Q4_2.svg', 'Q4_3.svg', 'scene4.mp4'],
        ['end.mp3', 'end.mp4']
    ],

    // 每幕配置
    scenes: [
        // 第0幕：欢迎页
        {
            type: 'welcome',
            texts: [
                { content: '打开音效体验更佳', delay: 0, waitForClick: true },
                { content: '敬所有跨越山海的奔赴', delay: 0, waitForClick: true },
                { content: '无畏岁月的誓言', delay: 0, waitForClick: true },
                { content: '祝爱情永不落幕', delay: 0, waitForClick: true }
            ],
            resources: [
                'bgm.mp3', 'click.mp3'
            ]

        },
        // 第1幕
        {
            type: 'question',
            video: 'scene1.mp4',
            question: '你们第一次踏在同一条小路上时，你脚下那双鞋曾经走过最多的地方是哪里？',
            bg: 'Q1bg.jpg',
            options: [
                '校园雨后松软的红土田径场',
                '晚风吹来青苔香气的河边小径',
                '城市凌晨两点还亮着灯的柏油马路'
            ],
            optionsfont: [
                'Q1_1.svg', 'Q1_2.svg', 'Q1_3.svg'
            ]
        },
        // 第2幕
        {
            type: 'question',
            video: 'scene2.mp4',
            question: '当你们一起爬上高塔，最先闪过脑海的念头是什么',
            bg: 'Q2bg.jpg',
            options: [
                '曾遥不可及的地方竟已在脚下',
                '风吹得刚刚好 似乎在庆祝',
                '告诉最牵挂的人 我平安'
            ],
            optionsfont: [
                'Q2_1.svg', 'Q2_2.svg', 'Q2_3.svg'
            ]
        },
        // 第3幕
        {
            type: 'question',
            video: 'scene3.mp4',
            question: '当平静突然坍塌，哪一瞬间你最想听到TA的声音？',
            bg: 'Q3bg.jpg',
            options: [
                '发着高烧 却找不到一颗退烧药',
                '加班到深夜 末班车刚好开远',
                '突然被告知裁员的下午'
            ],
            optionsfont: [
                'Q3_1.svg', 'Q3_2.svg', 'Q3_3.svg'
            ]
        },
        // 第4幕
        {
            type: 'question',
            video: 'scene4.mp4',
            question: '当你们终于安定下来，你最想先往客厅摆哪件小东西？',
            bg: 'Q4bg.jpg',
            options: [
                '一起存钱买的第一张唱片',
                '一起旅行买来的冰箱贴',
                '用拍立得打印的合照'
            ],
            optionsfont: [
                'Q4_1.svg', 'Q4_2.svg', 'Q4_3.svg'
            ]
        },
        // 第5幕：求婚
        {
            type: 'proposal',
            video: 'end.mp4',
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

// 调试开关：控制左上角资源监控与下载完成的页面通知
CONFIG.debug = {
    // 是否在左上角显示资源监控面板（每秒更新）
    enableResourceMonitor: true,
    // 是否在 mp4 预下载完成/失败/超时时显示短时通知
    enableDownloadNotices: true
};