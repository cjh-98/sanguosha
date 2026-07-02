/**
 * 三国杀武将数据
 * 包含：标准版25将 + 风火林山扩展武将 + 部分军争武将
 */
var SGS = window.SGS = window.SGS || {};

SGS.HeroData = (function() {
    // 势力
    const FACTION = { WEI:'wei', SHU:'shu', WU:'wu', QUN:'qun', SHEN:'shen' };
    const factionName = { wei:'魏', shu:'蜀', wu:'吴', qun:'群', shen:'神' };
    const factionColor = { wei:'#4a90d9', shu:'#e74c3c', wu:'#2ecc71', qun:'#95a5a6', shen:'#f39c12' };

    // 技能类型
    const SKILL_TYPE = {
        ACTIVE: 'active',     // 主动技
        PASSIVE: 'passive',   // 被动技
        LOCKED: 'locked',     // 锁定技
        LIMITED: 'limited',    // 限定技
        AWAKENING: 'awakening',// 觉醒技
        LORD: 'lord',         // 主公技
    };

    function hero(id, name, faction, maxHp, skills, opts = {}) {
        return {
            id, name, faction, maxHp,
            lordHp: opts.lordHp || maxHp + 1,
            gender: opts.gender || 'male',
            skills,
            desc: opts.desc || '',
            pack: opts.pack || 'standard',
            title: opts.title || '',
        };
    }

    const heroes = [
        // ===== 魏国 =====
        hero('caocao', '曹操', FACTION.WEI, 4, [
            { name:'奸雄', type:SKILL_TYPE.LOCKED, trigger:'onDamaged', desc:'锁定技，当你受到伤害后，你获得造成伤害的牌' },
            { name:'护驾', type:SKILL_TYPE.LORD, trigger:'needShan', desc:'主公技，当你需要使用【闪】时，可请魏势力角色打出【闪】' },
        ], { title:'魏武帝' }),

        hero('simayi', '司马懿', FACTION.WEI, 3, [
            { name:'反馈', type:SKILL_TYPE.PASSIVE, trigger:'onDamaged', desc:'当你受到伤害后，你获得伤害来源一张牌' },
            { name:'鬼才', type:SKILL_TYPE.ACTIVE, trigger:'onJudge', desc:'在判定牌生效前，你可以打出一张手牌代替之' },
        ]),

        hero('xiahoudun', '夏侯惇', FACTION.WEI, 4, [
            { name:'刚烈', type:SKILL_TYPE.PASSIVE, trigger:'onDamaged', desc:'当你受到伤害后，你可判定：若非红桃，伤害来源弃两张手牌或受1点伤害' },
        ]),

        hero('zhangliao', '张辽', FACTION.WEI, 4, [
            { name:'突袭', type:SKILL_TYPE.LOCKED, trigger:'drawPhase', desc:'锁定技，摸牌阶段你少摸一张牌，改为获得一至两名其他角色各一张手牌' },
        ]),

        hero('xuchu', '许褚', FACTION.WEI, 4, [
            { name:'裸衣', type:SKILL_TYPE.ACTIVE, trigger:'drawPhase', desc:'摸牌阶段你可以少摸一张牌，本回合【杀】和【决斗】伤害+1' },
        ]),

        hero('guojia', '郭嘉', FACTION.WEI, 3, [
            { name:'天妒', type:SKILL_TYPE.PASSIVE, trigger:'onJudge', desc:'当你的判定牌生效后，你获得此牌' },
            { name:'遗计', type:SKILL_TYPE.PASSIVE, trigger:'onDamaged', desc:'当你受到1点伤害后，你可摸两张牌，然后交给任意角色' },
        ]),

        hero('zhenji', '甄姬', FACTION.WEI, 3, [
            { name:'倾国', type:SKILL_TYPE.ACTIVE, trigger:'needShan', desc:'你可以将黑色手牌当【闪】使用或打出' },
            { name:'洛神', type:SKILL_TYPE.ACTIVE, trigger:'turnBegin', desc:'回合开始时，你可判定：黑色则获得此牌，可重复判定直到红色' },
        ]),

        // ===== 蜀国 =====
        hero('liubei', '刘备', FACTION.SHU, 4, [
            { name:'仁德', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'出牌阶段，你可以将任意手牌交给其他角色，给出2张以上时回复1点体力' },
            { name:'激将', type:SKILL_TYPE.LORD, trigger:'needSha', desc:'主公技，当你需要使用【杀】时，可请蜀势力角色打出【杀】' },
        ], { title:'昭烈帝' }),

        hero('guanyu', '关羽', FACTION.SHU, 4, [
            { name:'武圣', type:SKILL_TYPE.ACTIVE, trigger:'any', desc:'你可以将红色牌当【杀】使用或打出' },
        ]),

        hero('zhangfei', '张飞', FACTION.SHU, 4, [
            { name:'咆哮', type:SKILL_TYPE.LOCKED, trigger:'playPhase', desc:'锁定技，出牌阶段你可以使用任意数量的【杀】' },
        ]),

        hero('zhugeliang', '诸葛亮', FACTION.SHU, 3, [
            { name:'观星', type:SKILL_TYPE.ACTIVE, trigger:'turnBegin', desc:'回合开始时，你可以观看牌堆顶X张牌(X为存活角色数，最多5)，任意排列' },
            { name:'空城', type:SKILL_TYPE.LOCKED, trigger:'any', desc:'锁定技，当你没有手牌时，不能成为【杀】或【决斗】的目标' },
        ]),

        hero('zhaoyun', '赵云', FACTION.SHU, 4, [
            { name:'龙胆', type:SKILL_TYPE.ACTIVE, trigger:'any', desc:'你可以将【杀】当【闪】、【闪】当【杀】使用或打出' },
        ]),

        hero('machao', '马超', FACTION.SHU, 4, [
            { name:'马术', type:SKILL_TYPE.LOCKED, trigger:'any', desc:'锁定技，你与其他角色距离-1' },
            { name:'铁骑', type:SKILL_TYPE.PASSIVE, trigger:'onShaTarget', desc:'当你使用【杀】指定目标后，你可判定：红色则此【杀】不可被闪避' },
        ]),

        hero('huangyueying', '黄月英', FACTION.SHU, 3, [
            { name:'集智', type:SKILL_TYPE.PASSIVE, trigger:'onUseTrick', desc:'当你使用非延时锦囊时，你可以摸一张牌' },
            { name:'奇才', type:SKILL_TYPE.LOCKED, trigger:'any', desc:'锁定技，你使用锦囊无距离限制' },
        ]),

        // ===== 吴国 =====
        hero('sunquan', '孙权', FACTION.WU, 4, [
            { name:'制衡', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'出牌阶段限一次，你可以弃任意张牌，摸等量牌' },
            { name:'救援', type:SKILL_TYPE.LORD, trigger:'onDying', desc:'主公技，其他吴势力角色濒死用【桃】时额外回复1点' },
        ], { title:'吴大帝' }),

        hero('ganning', '甘宁', FACTION.WU, 4, [
            { name:'奇袭', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'你可以将黑色牌当【过河拆桥】使用' },
        ]),

        hero('lvmeng', '吕蒙', FACTION.WU, 4, [
            { name:'克己', type:SKILL_TYPE.PASSIVE, trigger:'discardPhase', desc:'若你出牌阶段未使用【杀】，可跳过弃牌阶段' },
        ]),

        hero('huanggai', '黄盖', FACTION.WU, 4, [
            { name:'苦肉', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'出牌阶段限一次，你可以失去1点体力，然后摸两张牌' },
        ]),

        hero('zhouyu', '周瑜', FACTION.WU, 3, [
            { name:'英姿', type:SKILL_TYPE.LOCKED, trigger:'drawPhase', desc:'锁定技，摸牌阶段你多摸一张牌' },
            { name:'反间', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'出牌阶段限一次，你可令一名角色选择花色并展示手牌，若无此花色则受1点伤害，然后获得此牌' },
        ]),

        hero('daqiao', '大乔', FACTION.WU, 3, [
            { name:'国色', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'出牌阶段限一次，你可以将方块牌当【乐不思蜀】使用' },
            { name:'流离', type:SKILL_TYPE.ACTIVE, trigger:'onShaTarget', desc:'当你成为【杀】目标时，你可弃一张牌将此【杀】转移给攻击范围内另一角色' },
        ]),

        hero('luxun', '陆逊', FACTION.WU, 3, [
            { name:'谦逊', type:SKILL_TYPE.LOCKED, trigger:'any', desc:'锁定技，你不能成为【顺手牵羊】和【乐不思蜀】的目标' },
            { name:'连营', type:SKILL_TYPE.PASSIVE, trigger:'onLoseLastCard', desc:'当你失去最后手牌时，你摸一张牌' },
        ]),

        hero('sunshangxiang', '孙尚香', FACTION.WU, 3, [
            { name:'结姻', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'出牌阶段限一次，弃两张手牌，令你与一名受伤男性角色各回1点体力' },
            { name:'枭姬', type:SKILL_TYPE.PASSIVE, trigger:'onLoseEquip', desc:'当你失去装备区一张牌后，你摸两张牌' },
        ], { gender:'female' }),

        // ===== 群雄 =====
        hero('huatuo', '华佗', FACTION.QUN, 3, [
            { name:'急救', type:SKILL_TYPE.ACTIVE, trigger:'any', desc:'你的回合外，你可以将红色牌当【桃】使用' },
            { name:'青囊', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'出牌阶段限一次，你可以弃一张手牌令一名角色回复1点体力' },
        ]),

        hero('lvbu', '吕布', FACTION.QUN, 4, [
            { name:'无双', type:SKILL_TYPE.LOCKED, trigger:'onShaTarget', desc:'锁定技，你使用【杀】需目标打出两张【闪】；【决斗】需双方轮流出两张【杀】' },
        ]),

        hero('diaochan', '貂蝉', FACTION.QUN, 3, [
            { name:'离间', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'出牌阶段限一次，弃一张牌，令两名男性角色进行【决斗】' },
            { name:'闭月', type:SKILL_TYPE.PASSIVE, trigger:'turnEnd', desc:'结束阶段，你摸一张牌' },
        ], { gender:'female' }),

        // ===== 风扩展包 =====
        hero('huangzhong', '黄忠', FACTION.SHU, 4, [
            { name:'烈弓', type:SKILL_TYPE.PASSIVE, trigger:'onShaTarget', desc:'你使用【杀】时，若你的手牌数不小于目标，此【杀】不可被闪避', pack:'wind' },
        ], { pack:'wind' }),

        hero('weiyan', '魏延', FACTION.SHU, 4, [
            { name:'狂骨', type:SKILL_TYPE.PASSIVE, trigger:'onDamageDealt', desc:'当你对距离1以内的角色造成伤害后，你可以回复1点体力', pack:'wind' },
        ], { pack:'wind' }),

        hero('caoren', '曹仁', FACTION.WEI, 4, [
            { name:'据守', type:SKILL_TYPE.ACTIVE, trigger:'turnEnd', desc:'结束阶段，你可以摸三张牌然后翻面', pack:'wind' },
        ], { pack:'wind' }),

        hero('xiahouchong', '夏侯渊', FACTION.WEI, 4, [
            { name:'神速', type:SKILL_TYPE.ACTIVE, trigger:'turnBegin', desc:'你可以跳过判定和摸牌阶段，视为使用了一张【杀】', pack:'wind' },
        ], { pack:'wind' }),

        hero('xiaoqiao', '小乔', FACTION.WU, 3, [
            { name:'天香', type:SKILL_TYPE.ACTIVE, trigger:'onDamaged', desc:'当你受到伤害时，你可以弃一张红桃牌将伤害转移给一名其他角色', pack:'wind' },
            { name:'红颜', type:SKILL_TYPE.LOCKED, trigger:'any', desc:'锁定技，你的黑桃牌视为红桃', pack:'wind' },
        ], { gender:'female', pack:'wind' }),

        hero('zhoutai', '周泰', FACTION.WU, 4, [
            { name:'不屈', type:SKILL_TYPE.LOCKED, trigger:'onDying', desc:'锁定技，当你体力降至0时，你可以亮出牌堆顶一张牌，若与之前不屈牌点数不同，你不会死亡', pack:'wind' },
        ], { pack:'wind' }),

        hero('zhangjiao', '张角', FACTION.QUN, 3, [
            { name:'雷击', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'当你使用或打出【闪】时，可令一名角色判定：若为黑桃，受2点雷电伤害', pack:'wind' },
            { name:'鬼道', type:SKILL_TYPE.ACTIVE, trigger:'onJudge', desc:'当判定生效前，你可以打出黑色牌替换之', pack:'wind' },
            { name:'黄天', type:SKILL_TYPE.LORD, trigger:'any', desc:'主公技，其他群势力角色可将【闪】或【无懈可击】交给你', pack:'wind' },
        ], { pack:'wind' }),

        hero('yuji', '于吉', FACTION.QUN, 3, [
            { name:'蛊惑', type:SKILL_TYPE.ACTIVE, trigger:'any', desc:'你可以将手牌背面朝上使用，声明为任意基本牌或非延时锦囊，质疑者可翻开验真', pack:'wind' },
        ], { pack:'wind' }),

        // ===== 火扩展包 =====
        hero('wolong', '诸葛亮(卧龙)', FACTION.SHU, 3, [
            { name:'八阵', type:SKILL_TYPE.LOCKED, trigger:'needShan', desc:'锁定技，当你需要【闪】时，可判定：红色视为【闪】', pack:'fire' },
            { name:'火计', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'你可以将红色牌当【火攻】使用', pack:'fire' },
            { name:'看破', type:SKILL_TYPE.ACTIVE, trigger:'any', desc:'你可以将黑色牌当【无懈可击】使用', pack:'fire' },
        ], { pack:'fire' }),

        hero('pangtong', '庞统', FACTION.SHU, 3, [
            { name:'连环', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'出牌阶段，你可以将梅花牌当【铁索连环】使用或重铸', pack:'fire' },
            { name:'涅槃', type:SKILL_TYPE.LIMITED, trigger:'onDying', desc:'限定技，当你处于濒死状态时，弃所有牌然后摸三张并回满体力', pack:'fire' },
        ], { pack:'fire' }),

        hero('dianwei', '典韦', FACTION.WEI, 4, [
            { name:'强袭', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'出牌阶段限一次，弃一张武器或失去1点体力，对一名角色造成1点伤害', pack:'fire' },
        ], { pack:'fire' }),

        hero('xunyu', '荀彧', FACTION.WEI, 3, [
            { name:'驱虎', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'出牌阶段限一次，与一名角色拼点：赢则对其攻击范围内一名角色造成1点伤害', pack:'fire' },
            { name:'节命', type:SKILL_TYPE.PASSIVE, trigger:'onDamaged', desc:'当你受到伤害后，可令一名角色将手牌补至其体力上限', pack:'fire' },
        ], { pack:'fire' }),

        hero('taishici', '太史慈', FACTION.WU, 4, [
            { name:'天义', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'出牌阶段限一次，与一名角色拼点：赢则本回合可使用两张【杀】且可额外指定一个目标', pack:'fire' },
        ], { pack:'fire' }),

        hero('pangde', '庞德', FACTION.QUN, 4, [
            { name:'马术', type:SKILL_TYPE.LOCKED, trigger:'any', desc:'锁定技，你与其他角色距离-1', pack:'fire' },
            { name:'猛进', type:SKILL_TYPE.PASSIVE, trigger:'onShaTarget', desc:'当你使用【杀】被【闪】抵消时，你可以弃其一张牌', pack:'fire' },
        ], { pack:'fire' }),

        hero('yuanshao', '袁绍', FACTION.QUN, 4, [
            { name:'乱击', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'你可以将两张同花色手牌当【万箭齐发】使用', pack:'fire' },
            { name:'血裔', type:SKILL_TYPE.LORD, trigger:'any', desc:'主公技，你的手牌上限+X(X为群势力角色数×2)', pack:'fire' },
        ], { pack:'fire' }),

        // ===== 林扩展包 =====
        hero('zhurong', '祝融', FACTION.QUN, 4, [
            { name:'烈刃', type:SKILL_TYPE.ACTIVE, trigger:'onShaTarget', desc:'当你使用【杀】指定目标后，可与其拼点：赢则获得其一张牌', pack:'forest' },
            { name:'象兵', type:SKILL_TYPE.LIMITED, trigger:'onLoseEquip', desc:'限定技，当你失去坐骑时，你可以摸三张牌', pack:'forest' },
        ], { gender:'female', pack:'forest' }),

        hero('menghuo', '孟获', FACTION.QUN, 4, [
            { name:'祸首', type:SKILL_TYPE.LOCKED, trigger:'any', desc:'锁定技，【南蛮入侵】的伤害来源视为你', pack:'forest' },
            { name:'再起', type:SKILL_TYPE.ACTIVE, trigger:'turnBegin', desc:'回合开始时，若你已受伤，可亮出牌堆顶牌，红色则回血，然后获得此牌', pack:'forest' },
        ], { pack:'forest' }),

        hero('caopi', '曹丕', FACTION.WEI, 3, [
            { name:'行殇', type:SKILL_TYPE.PASSIVE, trigger:'onPlayerDeath', desc:'当其他角色死亡时，你可以获得其所有牌', pack:'forest' },
            { name:'放逐', type:SKILL_TYPE.ACTIVE, trigger:'onDamaged', desc:'当你受到伤害后，你可以令一名角色翻面并摸X张牌(X为伤害值)', pack:'forest' },
        ], { pack:'forest' }),

        hero('xuhuang', '徐晃', FACTION.WEI, 4, [
            { name:'断粮', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'你可以将黑色非装备牌当【兵粮寸断】使用，距离改为2', pack:'forest' },
        ], { pack:'forest' }),

        hero('lusu', '鲁肃', FACTION.WU, 3, [
            { name:'好施', type:SKILL_TYPE.PASSIVE, trigger:'drawPhase', desc:'摸牌阶段，若你手牌少于5张，多摸两张', pack:'forest' },
            { name:'缔盟', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'出牌阶段限一次，令两名角色交换手牌', pack:'forest' },
        ], { pack:'forest' }),

        hero('sunjian', '孙坚', FACTION.WU, 4, [
            { name:'英魂', type:SKILL_TYPE.ACTIVE, trigger:'turnBegin', desc:'回合开始时，若你已受伤，可令一名角色摸X张然后弃Y张(X为已损体力,Y为X-1)', pack:'forest' },
        ], { pack:'forest' }),

        hero('dongzhuo', '董卓', FACTION.QUN, 8, [
            { name:'酒池', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'你可以将黑桃手牌当【酒】使用', pack:'forest' },
            { name:'肉林', type:SKILL_TYPE.LOCKED, trigger:'any', desc:'锁定技，你使用【杀】对女性角色伤害+1，女性角色对你同理', pack:'forest' },
            { name:'崩坏', type:SKILL_TYPE.LOCKED, trigger:'turnEnd', desc:'锁定技，结束阶段若你体力不是最少，失去1点体力', pack:'forest' },
            { name:'暴凌', type:SKILL_TYPE.LORD, trigger:'any', desc:'主公技，其他群势力角色对你造成的伤害+1', pack:'forest' },
        ], { pack:'forest' }),

        hero('jiaxu', '贾诩', FACTION.QUN, 3, [
            { name:'完杀', type:SKILL_TYPE.LOCKED, trigger:'onDying', desc:'锁定技，处于濒死状态的角色只能使用自己的【桃】', pack:'forest' },
            { name:'乱武', type:SKILL_TYPE.LIMITED, trigger:'playPhase', desc:'限定技，令所有其他角色对距离最近的角色使用【杀】，否则失去1点体力', pack:'forest' },
            { name:'帷幕', type:SKILL_TYPE.LOCKED, trigger:'any', desc:'锁定技，你不能成为黑色锦囊的目标', pack:'forest' },
        ], { pack:'forest' }),

        // ===== 山扩展包 =====
        hero('jiangwei', '姜维', FACTION.SHU, 4, [
            { name:'挑衅', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'出牌阶段限一次，令一名角色对你使用【杀】，否则你弃其一张牌', pack:'mountain' },
            { name:'志继', type:SKILL_TYPE.AWAKENING, trigger:'turnBegin', desc:'觉醒技，当你手牌为0时，减1点体力上限，获得技能"观星"', pack:'mountain' },
        ], { pack:'mountain' }),

        hero('liushan', '刘禅', FACTION.SHU, 3, [
            { name:'享乐', type:SKILL_TYPE.LOCKED, trigger:'onShaTarget', desc:'锁定技，其他角色对你使用【杀】需额外弃一张牌', pack:'mountain' },
            { name:'放权', type:SKILL_TYPE.ACTIVE, trigger:'turnBegin', desc:'你可以跳过本回合出牌阶段，然后回合结束时弃一张牌令一名角色进行一个额外回合', pack:'mountain' },
            { name:'若愚', type:SKILL_TYPE.AWAKENING, trigger:'any', desc:'主公技，觉醒技，当你体力为1时，回复1点并增加1点体力上限', pack:'mountain' },
        ], { pack:'mountain' }),

        hero('dengai', '邓艾', FACTION.WEI, 4, [
            { name:'屯田', type:SKILL_TYPE.PASSIVE, trigger:'onLoseCard', desc:'当你于回合外失去牌时，进行一次判定，若非红桃，将判定牌作为"田"标记', pack:'mountain' },
            { name:'凿险', type:SKILL_TYPE.AWAKENING, trigger:'any', desc:'觉醒技，当你的"田"达到3个时，减1点体力上限，获得"急袭"', pack:'mountain' },
        ], { pack:'mountain' }),

        hero('zhanghe', '张郃', FACTION.WEI, 4, [
            { name:'巧变', type:SKILL_TYPE.ACTIVE, trigger:'any', desc:'你可以弃一张手牌跳过判定/摸牌/出牌阶段；出牌阶段可移动场上一张装备或判定牌', pack:'mountain' },
        ], { pack:'mountain' }),

        hero('sunce', '孙策', FACTION.WU, 4, [
            { name:'激昂', type:SKILL_TYPE.LOCKED, trigger:'any', desc:'锁定技，你使用红【杀】或红色【决斗】伤害+1', pack:'mountain' },
            { name:'魂姿', type:SKILL_TYPE.AWAKENING, trigger:'turnBegin', desc:'觉醒技，当体力为1时，减1点体力上限，获得"英姿"和"英魂"', pack:'mountain' },
            { name:'制霸', type:SKILL_TYPE.LORD, trigger:'playPhase', desc:'主公技，其他吴势力角色可与孙策拼点', pack:'mountain' },
        ], { pack:'mountain' }),

        hero('zhangzhaozhanghong', '张昭张纮', FACTION.WU, 3, [
            { name:'直谏', type:SKILL_TYPE.ACTIVE, trigger:'playPhase', desc:'出牌阶段，你可以将手牌中的装备牌交给一名其他角色，然后摸一张牌', pack:'mountain' },
            { name:'固政', type:SKILL_TYPE.PASSIVE, trigger:'discardPhase', desc:'其他角色弃牌阶段弃牌时，你可以获得其中一张', pack:'mountain' },
        ], { pack:'mountain' }),

        hero('zuoci', '左慈', FACTION.QUN, 3, [
            { name:'化身', type:SKILL_TYPE.ACTIVE, trigger:'any', desc:'游戏开始时获得若干"化身"牌，你可以声明使用其中一张武将的技能', pack:'mountain' },
        ], { pack:'mountain' }),

        hero('caiwenji', '蔡文姬', FACTION.QUN, 3, [
            { name:'悲歌', type:SKILL_TYPE.ACTIVE, trigger:'onDamaged', desc:'当一名角色受到【杀】伤害后，你可以弃一张牌，令其判定：根据花色产生不同效果', pack:'mountain' },
            { name:'断肠', type:SKILL_TYPE.LOCKED, trigger:'onPlayerDeath', desc:'锁定技，杀死你的角色失去所有武将技能', pack:'mountain' },
        ], { gender:'female', pack:'mountain' }),

        // ===== 神武将 =====
        hero('shenguanyu', '神关羽', FACTION.SHEN, 5, [
            { name:'武神', type:SKILL_TYPE.LOCKED, trigger:'any', desc:'锁定技，你的红桃牌视为【杀】，使用红桃【杀】无距离限制' },
            { name:'武魂', type:SKILL_TYPE.LOCKED, trigger:'onPlayerDeath', desc:'锁定技，当你死亡时，令伤害来源获得梦魇标记最多者死亡' },
        ]),

        hero('shenlvbu', '神吕布', FACTION.SHEN, 5, [
            { name:'狂暴', type:SKILL_TYPE.LOCKED, trigger:'any', desc:'锁定技，你每受到1点伤害获得1枚"狂暴"标记，【杀】和【决斗】伤害+标记数' },
            { name:'神威', type:SKILL_TYPE.AWAKENING, trigger:'turnBegin', desc:'觉醒技，当狂暴标记达到6时，减1点体力上限，获得"神力"' },
        ]),

        hero('shenzhugeliang', '神诸葛亮', FACTION.SHEN, 3, [
            { name:'七星', type:SKILL_TYPE.ACTIVE, trigger:'gameStart', desc:'游戏开始时，你从11张牌中选4张手牌，其余作为"星"标记' },
            { name:'狂风', type:SKILL_TYPE.ACTIVE, trigger:'turnEnd', desc:'结束阶段，你可以弃1枚"星"标记，令一名角色受到火焰伤害+1' },
            { name:'大雾', type:SKILL_TYPE.ACTIVE, trigger:'turnEnd', desc:'结束阶段，你可以弃1枚"星"标记，令一名角色本回合免疫非火焰伤害' },
        ]),
    ];

    return {
        FACTION, factionName, factionColor, SKILL_TYPE,
        heroes,
        // 根据势力过滤
        getByFaction(faction) {
            return heroes.filter(h => h.faction === faction);
        },
        // 获取所有武将（可选过滤）
        getAll(opts = {}) {
            let list = [...heroes];
            if (opts.packs && opts.packs.length > 0) {
                list = list.filter(h => opts.packs.includes(h.pack));
            }
            return list;
        },
        getById(id) {
            return heroes.find(h => h.id === id);
        },
        // 随机抽取N个武将
        randomPick(count, exclude = []) {
            const available = heroes.filter(h => !exclude.includes(h.id));
            const picked = [];
            const pool = [...available];
            for (let i = 0; i < count && pool.length > 0; i++) {
                const idx = Math.floor(Math.random() * pool.length);
                picked.push(pool.splice(idx, 1)[0]);
            }
            return picked;
        }
    };
})();
