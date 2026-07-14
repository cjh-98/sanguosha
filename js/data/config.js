/**
 * 三国杀游戏配置
 * 身份分配、游戏模式、人数设置等
 */
var SGS = window.SGS = window.SGS || {};

SGS.Config = (function() {
    // 身份
    const IDENTITY = {
        LORD: 'lord',       // 主公
        LOYAL: 'loyal',     // 忠臣
        REBEL: 'rebel',     // 反贼
        SPY: 'spy',         // 内奸
    };

    const identityName = {
        lord: '主公', loyal: '忠臣', rebel: '反贼', spy: '内奸'
    };

    const identityColor = {
        lord: '#f39c12', loyal: '#3498db', rebel: '#e74c3c', spy: '#9b59b6'
    };

    // 身份局身份分配（按人数）
    // [主公, 忠臣, 反贼, 内奸]
    const identitySetup = {
        2:  [1, 0, 1, 0],   // 主公 vs 反贼
        3:  [1, 0, 1, 1],   // 主公+内奸 vs 反贼
        4:  [1, 1, 1, 1],   // 经典4人
        5:  [1, 1, 2, 1],
        6:  [1, 1, 3, 1],
        7:  [1, 2, 3, 1],
        8:  [1, 2, 4, 1],
        9:  [1, 3, 4, 1],
        10: [1, 3, 5, 1],
    };

    // 游戏模式
    const MODES = {
        STANDARD: 'standard',   // 身份局（标准）
        MILITARY: 'military',   // 军争（身份局+军争卡牌）
        NATIONAL: 'national',   // 国战
    };

    const modeName = {
        standard: '身份局',
        military: '军争局',
        national: '国战',
    };

    const modeDesc = {
        standard: '标准身份局，使用标准版卡牌',
        military: '军争身份局，标准版+军争篇卡牌',
        national: '国战模式，双将暗将，势力对抗',
    };

    // 选将模式
    const PICK_MODE = {
        RANDOM: 'random',   // 随机抽取N个武将供选择
        FREE: 'free',       // 自由选择全部武将
    };

    const pickModeName = {
        random: '随机选将',
        free: '自由选将',
    };

    // 回合阶段
    const PHASE = {
        BEGIN: 'begin',       // 回合开始
        JUDGE: 'judge',       // 判定阶段
        DRAW: 'draw',         // 摸牌阶段
        PLAY: 'play',         // 出牌阶段
        DISCARD: 'discard',   // 弃牌阶段
        END: 'end',           // 回合结束
    };

    const phaseName = {
        begin: '回合开始',
        judge: '判定阶段',
        draw: '摸牌阶段',
        play: '出牌阶段',
        discard: '弃牌阶段',
        end: '回合结束',
    };

    // AI名字池
    const aiNames = [
        '子龙', '云长', '翼德', '孔明', '伯符', '公瑾', '奉孝', '文和',
        '元直', '士元', '伯言', '幼平', '子义', '伯符', '文台', '伯道',
        '子义', '文若', '奉孝', '公达', '伯宁', '子扬', '文和', '公纪',
        '伯海', '子明', '公覆', '子布', '子纲', '伯符', '仲谋', '玄德',
        '云长', '翼德', '子龙', '孔明', '士元', '法正', '伯约', '文长',
    ];

    // 国战势力人数限制
    function getNationalMaxFaction(playerCount) {
        return Math.floor(playerCount / 2);
    }

    // 获取身份分配
    function getIdentityList(playerCount) {
        const setup = identitySetup[playerCount] || identitySetup[8];
        const list = [];
        for (const [identity, count] of [
            [IDENTITY.LORD, setup[0]],
            [IDENTITY.LOYAL, setup[1]],
            [IDENTITY.REBEL, setup[2]],
            [IDENTITY.SPY, setup[3]],
        ]) {
            for (let i = 0; i < count; i++) {
                list.push(identity);
            }
        }
        return list;
    }

    return {
        IDENTITY, identityName, identityColor,
        identitySetup, getIdentityList,
        MODES, modeName, modeDesc,
        PICK_MODE, pickModeName,
        PHASE, phaseName,
        aiNames,
        getNationalMaxFaction,
    };
})();
