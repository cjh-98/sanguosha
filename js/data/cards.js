/**
 * 三国杀卡牌数据
 * 包含：标准版(108张) + 军争篇(52张) = 160张
 */
var SGS = window.SGS = window.SGS || {};

SGS.CardData = (function() {
    // 花色
    const SUIT = { SPADE: 'spade', HEART: 'heart', CLUB: 'club', DIAMOND: 'diamond' };
    // 卡牌类型
    const TYPE = { BASIC: 'basic', TRICK: 'trick', DELAY: 'delay', EQUIP: 'equip' };
    // 装备栏位
    const SLOT = { WEAPON: 'weapon', ARMOR: 'armor', HORSE_PLUS: 'horse_plus', HORSE_MINUS: 'horse_minus' };

    // 卡牌定义模板
    function card(name, suit, number, type, subtype, opts = {}) {
        return {
            name, suit, number, type, subtype,
            element: opts.element || 'normal', // normal, fire, thunder
            range: opts.range || 0,            // 武器攻击距离
            slot: opts.slot || null,           // 装备栏位
            desc: opts.desc || '',
            pack: opts.pack || 'standard',     // standard, military
            isEx: opts.isEx || false,
        };
    }

    // ===== 标准版卡牌 (108张) =====
    const standardCards = [
        // === 杀 (30张) ===
        card('杀', SUIT.SPADE, 7, TYPE.BASIC, 'sha'),
        card('杀', SUIT.SPADE, 8, TYPE.BASIC, 'sha'),
        card('杀', SUIT.SPADE, 9, TYPE.BASIC, 'sha'),
        card('杀', SUIT.SPADE, 10, TYPE.BASIC, 'sha'),
        card('杀', SUIT.SPADE, 8, TYPE.BASIC, 'sha'),
        card('杀', SUIT.SPADE, 9, TYPE.BASIC, 'sha'),
        card('杀', SUIT.SPADE, 7, TYPE.BASIC, 'sha'),
        card('杀', SUIT.CLUB, 2, TYPE.BASIC, 'sha'),
        card('杀', SUIT.CLUB, 3, TYPE.BASIC, 'sha'),
        card('杀', SUIT.CLUB, 4, TYPE.BASIC, 'sha'),
        card('杀', SUIT.CLUB, 5, TYPE.BASIC, 'sha'),
        card('杀', SUIT.CLUB, 6, TYPE.BASIC, 'sha'),
        card('杀', SUIT.CLUB, 7, TYPE.BASIC, 'sha'),
        card('杀', SUIT.CLUB, 8, TYPE.BASIC, 'sha'),
        card('杀', SUIT.CLUB, 8, TYPE.BASIC, 'sha'),
        card('杀', SUIT.CLUB, 9, TYPE.BASIC, 'sha'),
        card('杀', SUIT.CLUB, 9, TYPE.BASIC, 'sha'),
        card('杀', SUIT.CLUB, 10, TYPE.BASIC, 'sha'),
        card('杀', SUIT.CLUB, 10, TYPE.BASIC, 'sha'),
        card('杀', SUIT.CLUB, 11, TYPE.BASIC, 'sha'),
        card('杀', SUIT.CLUB, 11, TYPE.BASIC, 'sha'),
        card('杀', SUIT.CLUB, 12, TYPE.BASIC, 'sha'),
        card('杀', SUIT.CLUB, 13, TYPE.BASIC, 'sha'),
        card('杀', SUIT.HEART, 10, TYPE.BASIC, 'sha'),
        card('杀', SUIT.HEART, 10, TYPE.BASIC, 'sha'),
        card('杀', SUIT.HEART, 11, TYPE.BASIC, 'sha'),
        card('杀', SUIT.DIAMOND, 6, TYPE.BASIC, 'sha'),
        card('杀', SUIT.DIAMOND, 7, TYPE.BASIC, 'sha'),
        card('杀', SUIT.DIAMOND, 8, TYPE.BASIC, 'sha'),
        card('杀', SUIT.DIAMOND, 9, TYPE.BASIC, 'sha'),
        card('杀', SUIT.DIAMOND, 10, TYPE.BASIC, 'sha'),
        card('杀', SUIT.DIAMOND, 13, TYPE.BASIC, 'sha'),

        // === 闪 (15张) ===
        card('闪', SUIT.HEART, 2, TYPE.BASIC, 'shan'),
        card('闪', SUIT.HEART, 2, TYPE.BASIC, 'shan'),
        card('闪', SUIT.HEART, 13, TYPE.BASIC, 'shan'),
        card('闪', SUIT.DIAMOND, 2, TYPE.BASIC, 'shan'),
        card('闪', SUIT.DIAMOND, 2, TYPE.BASIC, 'shan'),
        card('闪', SUIT.DIAMOND, 3, TYPE.BASIC, 'shan'),
        card('闪', SUIT.DIAMOND, 4, TYPE.BASIC, 'shan'),
        card('闪', SUIT.DIAMOND, 5, TYPE.BASIC, 'shan'),
        card('闪', SUIT.DIAMOND, 6, TYPE.BASIC, 'shan'),
        card('闪', SUIT.DIAMOND, 7, TYPE.BASIC, 'shan'),
        card('闪', SUIT.DIAMOND, 8, TYPE.BASIC, 'shan'),
        card('闪', SUIT.DIAMOND, 9, TYPE.BASIC, 'shan'),
        card('闪', SUIT.DIAMOND, 10, TYPE.BASIC, 'shan'),
        card('闪', SUIT.DIAMOND, 11, TYPE.BASIC, 'shan'),
        card('闪', SUIT.DIAMOND, 11, TYPE.BASIC, 'shan'),

        // === 桃 (8张) ===
        card('桃', SUIT.HEART, 3, TYPE.BASIC, 'tao'),
        card('桃', SUIT.HEART, 4, TYPE.BASIC, 'tao'),
        card('桃', SUIT.HEART, 5, TYPE.BASIC, 'tao'),
        card('桃', SUIT.HEART, 6, TYPE.BASIC, 'tao'),
        card('桃', SUIT.HEART, 6, TYPE.BASIC, 'tao'),
        card('桃', SUIT.HEART, 7, TYPE.BASIC, 'tao'),
        card('桃', SUIT.HEART, 8, TYPE.BASIC, 'tao'),
        card('桃', SUIT.HEART, 9, TYPE.BASIC, 'tao'),
        card('桃', SUIT.HEART, 12, TYPE.BASIC, 'tao'),
        card('桃', SUIT.DIAMOND, 12, TYPE.BASIC, 'tao'),
        card('桃', SUIT.DIAMOND, 3, TYPE.BASIC, 'tao'),
        card('桃', SUIT.DIAMOND, 3, TYPE.BASIC, 'tao'),
        card('桃', SUIT.DIAMOND, 3, TYPE.BASIC, 'tao'),
        card('桃', SUIT.DIAMOND, 3, TYPE.BASIC, 'tao'),
        card('桃', SUIT.DIAMOND, 3, TYPE.BASIC, 'tao'),
        card('桃', SUIT.DIAMOND, 3, TYPE.BASIC, 'tao'),

        // === 非延时锦囊 ===
        // 决斗 (3张)
        card('决斗', SUIT.SPADE, 1, TYPE.TRICK, 'juedou', {desc:'出牌阶段对一名其他角色使用，由其开始轮流打出【杀】，先无【杀】可出者受到1点伤害'}),
        card('决斗', SUIT.CLUB, 1, TYPE.TRICK, 'juedou', {desc:'出牌阶段对一名其他角色使用，由其开始轮流打出【杀】，先无【杀】可出者受到1点伤害'}),
        card('决斗', SUIT.DIAMOND, 1, TYPE.TRICK, 'juedou', {desc:'出牌阶段对一名其他角色使用，由其开始轮流打出【杀】，先无【杀】可出者受到1点伤害'}),

        // 借刀杀人 (2张)
        card('借刀杀人', SUIT.CLUB, 11, TYPE.TRICK, 'jiedao', {desc:'出牌阶段对一名装备武器的角色使用，令其对另一名角色出【杀】，否则将其武器交给你'}),
        card('借刀杀人', SUIT.CLUB, 12, TYPE.TRICK, 'jiedao', {desc:'出牌阶段对一名装备武器的角色使用，令其对另一名角色出【杀】，否则将其武器交给你'}),

        // 无中生有 (4张)
        card('无中生有', SUIT.HEART, 7, TYPE.TRICK, 'wuzhong', {desc:'出牌阶段对自己使用，摸两张牌'}),
        card('无中生有', SUIT.HEART, 8, TYPE.TRICK, 'wuzhong', {desc:'出牌阶段对自己使用，摸两张牌'}),
        card('无中生有', SUIT.HEART, 9, TYPE.TRICK, 'wuzhong', {desc:'出牌阶段对自己使用，摸两张牌'}),
        card('无中生有', SUIT.HEART, 11, TYPE.TRICK, 'wuzhong', {desc:'出牌阶段对自己使用，摸两张牌'}),

        // 过河拆桥 (6张)
        card('过河拆桥', SUIT.SPADE, 3, TYPE.TRICK, 'guohe', {desc:'出牌阶段对一名其他角色使用，弃置其一张牌'}),
        card('过河拆桥', SUIT.SPADE, 4, TYPE.TRICK, 'guohe', {desc:'出牌阶段对一名其他角色使用，弃置其一张牌'}),
        card('过河拆桥', SUIT.SPADE, 12, TYPE.TRICK, 'guohe', {desc:'出牌阶段对一名其他角色使用，弃置其一张牌'}),
        card('过河拆桥', SUIT.CLUB, 3, TYPE.TRICK, 'guohe', {desc:'出牌阶段对一名其他角色使用，弃置其一张牌'}),
        card('过河拆桥', SUIT.CLUB, 4, TYPE.TRICK, 'guohe', {desc:'出牌阶段对一名其他角色使用，弃置其一张牌'}),
        card('过河拆桥', SUIT.HEART, 12, TYPE.TRICK, 'guohe', {desc:'出牌阶段对一名其他角色使用，弃置其一张牌'}),

        // 顺手牵羊 (5张)
        card('顺手牵羊', SUIT.SPADE, 3, TYPE.TRICK, 'shunshou', {desc:'出牌阶段对距离1以内的一名角色使用，获得其一张牌'}),
        card('顺手牵羊', SUIT.SPADE, 4, TYPE.TRICK, 'shunshou', {desc:'出牌阶段对距离1以内的一名角色使用，获得其一张牌'}),
        card('顺手牵羊', SUIT.SPADE, 11, TYPE.TRICK, 'shunshou', {desc:'出牌阶段对距离1以内的一名角色使用，获得其一张牌'}),
        card('顺手牵羊', SUIT.DIAMOND, 3, TYPE.TRICK, 'shunshou', {desc:'出牌阶段对距离1以内的一名角色使用，获得其一张牌'}),
        card('顺手牵羊', SUIT.DIAMOND, 4, TYPE.TRICK, 'shunshou', {desc:'出牌阶段对距离1以内的一名角色使用，获得其一张牌'}),

        // 无懈可击 (3张标准)
        card('无懈可击', SUIT.SPADE, 2, TYPE.TRICK, 'wuxie', {desc:'当锦囊牌生效前，抵消其对一名角色的效果'}),
        card('无懈可击', SUIT.CLUB, 1, TYPE.TRICK, 'wuxie', {desc:'当锦囊牌生效前，抵消其对一名角色的效果'}),
        card('无懈可击', SUIT.CLUB, 13, TYPE.TRICK, 'wuxie', {desc:'当锦囊牌生效前，抵消其对一名角色的效果'}),
        card('无懈可击', SUIT.DIAMOND, 1, TYPE.TRICK, 'wuxie', {desc:'当锦囊牌生效前，抵消其对一名角色的效果'}),

        // 南蛮入侵 (3张)
        card('南蛮入侵', SUIT.SPADE, 7, TYPE.TRICK, 'nanman', {desc:'出牌阶段对所有其他角色使用，每名角色需打出【杀】，否则受到1点伤害'}),
        card('南蛮入侵', SUIT.SPADE, 13, TYPE.TRICK, 'nanman', {desc:'出牌阶段对所有其他角色使用，每名角色需打出【杀】，否则受到1点伤害'}),
        card('南蛮入侵', SUIT.CLUB, 7, TYPE.TRICK, 'nanman', {desc:'出牌阶段对所有其他角色使用，每名角色需打出【杀】，否则受到1点伤害'}),

        // 万箭齐发 (1张)
        card('万箭齐发', SUIT.HEART, 1, TYPE.TRICK, 'wanjian', {desc:'出牌阶段对所有其他角色使用，每名角色需打出【闪】，否则受到1点伤害'}),

        // 桃园结义 (1张)
        card('桃园结义', SUIT.HEART, 1, TYPE.TRICK, 'taoyuan', {desc:'出牌阶段对所有角色使用，每名角色回复1点体力'}),

        // 五谷丰登 (2张)
        card('五谷丰登', SUIT.HEART, 3, TYPE.TRICK, 'wugu', {desc:'出牌阶段对所有角色使用，从牌堆亮出存活角色数张牌，每人依次选一张'}),
        card('五谷丰登', SUIT.HEART, 4, TYPE.TRICK, 'wugu', {desc:'出牌阶段对所有角色使用，从牌堆亮出存活角色数张牌，每人依次选一张'}),

        // === 延时锦囊 ===
        // 闪电 (1张标准 + 1张EX)
        card('闪电', SUIT.SPADE, 1, TYPE.DELAY, 'shandian', {desc:'判定若为黑桃2~9，受到3点雷电伤害，否则传给下家'}),
        card('闪电', SUIT.HEART, 12, TYPE.DELAY, 'shandian', {desc:'判定若为黑桃2~9，受到3点雷电伤害，否则传给下家', isEx:true}),

        // 乐不思蜀 (3张)
        card('乐不思蜀', SUIT.CLUB, 6, TYPE.DELAY, 'lebusi', {desc:'判定若不为红桃，跳过出牌阶段'}),
        card('乐不思蜀', SUIT.SPADE, 6, TYPE.DELAY, 'lebusi', {desc:'判定若不为红桃，跳过出牌阶段'}),
        card('乐不思蜀', SUIT.HEART, 6, TYPE.DELAY, 'lebusi', {desc:'判定若不为红桃，跳过出牌阶段'}),

        // === 装备牌 ===
        // 武器
        card('诸葛连弩', SUIT.CLUB, 1, TYPE.EQUIP, 'zhuge', {slot:SLOT.WEAPON, range:1, desc:'锁定技，出牌阶段你可以使用任意数量的【杀】'}),
        card('诸葛连弩', SUIT.DIAMOND, 1, TYPE.EQUIP, 'zhuge', {slot:SLOT.WEAPON, range:1, desc:'锁定技，出牌阶段你可以使用任意数量的【杀】'}),
        card('雌雄双股剑', SUIT.SPADE, 2, TYPE.EQUIP, 'cixiong', {slot:SLOT.WEAPON, range:2, desc:'使用【杀】指定异性目标后，你可以令其选择弃一张手牌或让你摸一张牌'}),
        card('青釭剑', SUIT.SPADE, 6, TYPE.EQUIP, 'qinggang', {slot:SLOT.WEAPON, range:2, desc:'锁定技，你使用【杀】时无视目标的防具'}),
        card('寒冰剑', SUIT.SPADE, 2, TYPE.EQUIP, 'hanbing', {slot:SLOT.WEAPON, range:2, desc:'使用【杀】造成伤害时可改为弃置目标两张牌', isEx:true}),
        card('贯石斧', SUIT.DIAMOND, 5, TYPE.EQUIP, 'guanshi', {slot:SLOT.WEAPON, range:3, desc:'使用【杀】被【闪】抵消时，可弃两张牌强制命中'}),
        card('青龙偃月刀', SUIT.SPADE, 5, TYPE.EQUIP, 'qinglong', {slot:SLOT.WEAPON, range:3, desc:'使用【杀】被【闪】抵消时，可再出一张【杀】'}),
        card('丈八蛇矛', SUIT.SPADE, 12, TYPE.EQUIP, 'zhangba', {slot:SLOT.WEAPON, range:3, desc:'你可以将两张手牌当【杀】使用'}),
        card('方天画戟', SUIT.DIAMOND, 12, TYPE.EQUIP, 'fangtian', {slot:SLOT.WEAPON, range:4, desc:'若你手中最后一张牌是【杀】，可指定至多三名目标'}),
        card('麒麟弓', SUIT.HEART, 5, TYPE.EQUIP, 'qilin', {slot:SLOT.WEAPON, range:5, desc:'使用【杀】造成伤害后，可弃置目标一匹坐骑'}),

        // 防具
        card('八卦阵', SUIT.SPADE, 2, TYPE.EQUIP, 'bagua', {slot:SLOT.ARMOR, desc:'当你需要使用或打出【闪】时，可判定：红色视为【闪】'}),
        card('八卦阵', SUIT.CLUB, 2, TYPE.EQUIP, 'bagua', {slot:SLOT.ARMOR, desc:'当你需要使用或打出【闪】时，可判定：红色视为【闪】'}),
        card('仁王盾', SUIT.CLUB, 2, TYPE.EQUIP, 'renwang', {slot:SLOT.ARMOR, desc:'锁定技，黑色【杀】对你无效', isEx:true}),

        // 坐骑 -1马(进攻马)
        card('-1马', SUIT.SPADE, 13, TYPE.EQUIP, 'horse_minus', {slot:SLOT.HORSE_MINUS, desc:'你与其他角色距离-1'}),
        card('-1马', SUIT.HEART, 13, TYPE.EQUIP, 'horse_minus', {slot:SLOT.HORSE_MINUS, desc:'你与其他角色距离-1'}),
        card('-1马', SUIT.DIAMOND, 13, TYPE.EQUIP, 'horse_minus', {slot:SLOT.HORSE_MINUS, desc:'你与其他角色距离-1'}),

        // 坐骑 +1马(防守马)
        card('+1马', SUIT.CLUB, 5, TYPE.EQUIP, 'horse_plus', {slot:SLOT.HORSE_PLUS, desc:'其他角色与你距离+1'}),
        card('+1马', SUIT.SPADE, 5, TYPE.EQUIP, 'horse_plus', {slot:SLOT.HORSE_PLUS, desc:'其他角色与你距离+1'}),
        card('+1马', SUIT.HEART, 5, TYPE.EQUIP, 'horse_plus', {slot:SLOT.HORSE_PLUS, desc:'其他角色与你距离+1'}),
    ];

    // ===== 军争篇卡牌 (52张) =====
    const militaryCards = [
        // === 火杀 (5张) ===
        card('火杀', SUIT.HEART, 7, TYPE.BASIC, 'sha', {element:'fire', pack:'military'}),
        card('火杀', SUIT.HEART, 8, TYPE.BASIC, 'sha', {element:'fire', pack:'military'}),
        card('火杀', SUIT.HEART, 9, TYPE.BASIC, 'sha', {element:'fire', pack:'military'}),
        card('火杀', SUIT.HEART, 10, TYPE.BASIC, 'sha', {element:'fire', pack:'military'}),
        card('火杀', SUIT.DIAMOND, 4, TYPE.BASIC, 'sha', {element:'fire', pack:'military'}),

        // === 雷杀 (9张) ===
        card('雷杀', SUIT.SPADE, 4, TYPE.BASIC, 'sha', {element:'thunder', pack:'military'}),
        card('雷杀', SUIT.SPADE, 5, TYPE.BASIC, 'sha', {element:'thunder', pack:'military'}),
        card('雷杀', SUIT.SPADE, 6, TYPE.BASIC, 'sha', {element:'thunder', pack:'military'}),
        card('雷杀', SUIT.SPADE, 7, TYPE.BASIC, 'sha', {element:'thunder', pack:'military'}),
        card('雷杀', SUIT.SPADE, 8, TYPE.BASIC, 'sha', {element:'thunder', pack:'military'}),
        card('雷杀', SUIT.CLUB, 5, TYPE.BASIC, 'sha', {element:'thunder', pack:'military'}),
        card('雷杀', SUIT.CLUB, 6, TYPE.BASIC, 'sha', {element:'thunder', pack:'military'}),
        card('雷杀', SUIT.CLUB, 7, TYPE.BASIC, 'sha', {element:'thunder', pack:'military'}),
        card('雷杀', SUIT.CLUB, 8, TYPE.BASIC, 'sha', {element:'thunder', pack:'military'}),

        // === 闪 (9张) ===
        card('闪', SUIT.HEART, 4, TYPE.BASIC, 'shan', {pack:'military'}),
        card('闪', SUIT.HEART, 5, TYPE.BASIC, 'shan', {pack:'military'}),
        card('闪', SUIT.HEART, 11, TYPE.BASIC, 'shan', {pack:'military'}),
        card('闪', SUIT.HEART, 12, TYPE.BASIC, 'shan', {pack:'military'}),
        card('闪', SUIT.DIAMOND, 6, TYPE.BASIC, 'shan', {pack:'military'}),
        card('闪', SUIT.DIAMOND, 7, TYPE.BASIC, 'shan', {pack:'military'}),
        card('闪', SUIT.DIAMOND, 8, TYPE.BASIC, 'shan', {pack:'military'}),
        card('闪', SUIT.DIAMOND, 10, TYPE.BASIC, 'shan', {pack:'military'}),
        card('闪', SUIT.DIAMOND, 11, TYPE.BASIC, 'shan', {pack:'military'}),

        // === 桃 (4张) ===
        card('桃', SUIT.HEART, 5, TYPE.BASIC, 'tao', {pack:'military'}),
        card('桃', SUIT.HEART, 6, TYPE.BASIC, 'tao', {pack:'military'}),
        card('桃', SUIT.DIAMOND, 2, TYPE.BASIC, 'tao', {pack:'military'}),
        card('桃', SUIT.DIAMOND, 3, TYPE.BASIC, 'tao', {pack:'military'}),

        // === 酒 (5张) ===
        card('酒', SUIT.SPADE, 3, TYPE.BASIC, 'jiu', {pack:'military', desc:'出牌阶段使用，令下一张【杀】伤害+1(每回合限1次)；濒死时使用回复1点体力'}),
        card('酒', SUIT.SPADE, 9, TYPE.BASIC, 'jiu', {pack:'military', desc:'出牌阶段使用，令下一张【杀】伤害+1(每回合限1次)；濒死时使用回复1点体力'}),
        card('酒', SUIT.CLUB, 3, TYPE.BASIC, 'jiu', {pack:'military', desc:'出牌阶段使用，令下一张【杀】伤害+1(每回合限1次)；濒死时使用回复1点体力'}),
        card('酒', SUIT.CLUB, 9, TYPE.BASIC, 'jiu', {pack:'military', desc:'出牌阶段使用，令下一张【杀】伤害+1(每回合限1次)；濒死时使用回复1点体力'}),
        card('酒', SUIT.DIAMOND, 9, TYPE.BASIC, 'jiu', {pack:'military', desc:'出牌阶段使用，令下一张【杀】伤害+1(每回合限1次)；濒死时使用回复1点体力'}),

        // === 延时锦囊 ===
        // 兵粮寸断 (2张)
        card('兵粮寸断', SUIT.SPADE, 10, TYPE.DELAY, 'bingliang', {pack:'military', desc:'对距离1以内的角色使用，判定若不为梅花，跳过其摸牌阶段'}),
        card('兵粮寸断', SUIT.CLUB, 4, TYPE.DELAY, 'bingliang', {pack:'military', desc:'对距离1以内的角色使用，判定若不为梅花，跳过其摸牌阶段'}),

        // === 非延时锦囊 ===
        // 火攻 (3张)
        card('火攻', SUIT.HEART, 2, TYPE.TRICK, 'huogong', {pack:'military', desc:'对一名有手牌的角色使用，其展示一张手牌，你弃同花色牌则造成1点火焰伤害'}),
        card('火攻', SUIT.HEART, 3, TYPE.TRICK, 'huogong', {pack:'military', desc:'对一名有手牌的角色使用，其展示一张手牌，你弃同花色牌则造成1点火焰伤害'}),
        card('火攻', SUIT.DIAMOND, 12, TYPE.TRICK, 'huogong', {pack:'military', desc:'对一名有手牌的角色使用，其展示一张手牌，你弃同花色牌则造成1点火焰伤害'}),

        // 铁索连环 (6张)
        card('铁索连环', SUIT.SPADE, 11, TYPE.TRICK, 'tiesuo', {pack:'military', desc:'横置或重置至多两名角色；或重铸(弃此牌摸一张牌)'}),
        card('铁索连环', SUIT.SPADE, 12, TYPE.TRICK, 'tiesuo', {pack:'military', desc:'横置或重置至多两名角色；或重铸(弃此牌摸一张牌)'}),
        card('铁索连环', SUIT.CLUB, 10, TYPE.TRICK, 'tiesuo', {pack:'military', desc:'横置或重置至多两名角色；或重铸(弃此牌摸一张牌)'}),
        card('铁索连环', SUIT.CLUB, 11, TYPE.TRICK, 'tiesuo', {pack:'military', desc:'横置或重置至多两名角色；或重铸(弃此牌摸一张牌)'}),
        card('铁索连环', SUIT.CLUB, 12, TYPE.TRICK, 'tiesuo', {pack:'military', desc:'横置或重置至多两名角色；或重铸(弃此牌摸一张牌)'}),
        card('铁索连环', SUIT.CLUB, 13, TYPE.TRICK, 'tiesuo', {pack:'military', desc:'横置或重置至多两名角色；或重铸(弃此牌摸一张牌)'}),

        // 无懈可击 (3张军争)
        card('无懈可击', SUIT.SPADE, 13, TYPE.TRICK, 'wuxie', {pack:'military', desc:'当锦囊牌生效前，抵消其对一名角色的效果'}),
        card('无懈可击', SUIT.HEART, 1, TYPE.TRICK, 'wuxie', {pack:'military', desc:'当锦囊牌生效前，抵消其对一名角色的效果'}),
        card('无懈可击', SUIT.HEART, 13, TYPE.TRICK, 'wuxie', {pack:'military', desc:'当锦囊牌生效前，抵消其对一名角色的效果'}),

        // === 装备牌 ===
        card('古锭刀', SUIT.SPADE, 2, TYPE.EQUIP, 'guding', {pack:'military', slot:SLOT.WEAPON, range:2, desc:'锁定技，使用【杀】造成伤害时，若目标无手牌，伤害+1'}),
        card('朱雀羽扇', SUIT.DIAMOND, 5, TYPE.EQUIP, 'zhuque', {pack:'military', slot:SLOT.WEAPON, range:4, desc:'你可以将普通【杀】当火【杀】使用'}),
        card('藤甲', SUIT.SPADE, 2, TYPE.EQUIP, 'tengjia', {pack:'military', slot:SLOT.ARMOR, desc:'锁定技，【南蛮入侵】【万箭齐发】和普通【杀】对你无效；火焰伤害+1'}),
        card('藤甲', SUIT.CLUB, 2, TYPE.EQUIP, 'tengjia', {pack:'military', slot:SLOT.ARMOR, desc:'锁定技，【南蛮入侵】【万箭齐发】和普通【杀】对你无效；火焰伤害+1'}),
        card('白银狮子', SUIT.CLUB, 1, TYPE.EQUIP, 'baiyin', {pack:'military', slot:SLOT.ARMOR, desc:'锁定技，每次受到伤害最多1点；失去时回复1点体力'}),
        card('骅骝', SUIT.DIAMOND, 13, TYPE.EQUIP, 'horse_plus', {pack:'military', slot:SLOT.HORSE_PLUS, desc:'其他角色与你距离+1'}),
    ];

    // 所有卡牌合并
    const allCards = [...standardCards, ...militaryCards];

    // 花色中文名
    const suitName = {
        spade: '♠', heart: '♥', club: '♣', diamond: '♦'
    };
    const suitColor = {
        spade: 'black', heart: 'red', club: 'black', diamond: 'red'
    };
    const numberName = {
        1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
        8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K'
    };

    return {
        SUIT, TYPE, SLOT,
        standardCards,
        militaryCards,
        allCards,
        suitName,
        suitColor,
        numberName,
        // 根据设置生成牌堆
        createDeck(opts = {}) {
            const { includeMilitary = true, bannedSubtypes = [] } = opts;
            let cards = includeMilitary ? [...allCards] : [...standardCards];
            // 过滤掉被ban的卡牌类型
            if (bannedSubtypes.length > 0) {
                cards = cards.filter(c => !bannedSubtypes.includes(c.subtype));
            }
            // 赋予唯一ID：instanceId 必须与 uid 一致且唯一
            // （引擎在多处依赖 instanceId 做卡牌定位：handCards.find、装备/判定匹配、过牌过滤等；
            //  若 instanceId 为 null，所有卡牌的 instanceId 都互相等价，会导致定位错乱/装备被误清等 bug）
            return cards.map((c, i) => ({ ...c, uid: 'c' + i, instanceId: 'c' + i }));
        }
    };
})();
