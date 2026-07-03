/**
 * 三国杀AI系统
 * 基于规则的决策系统，处理出牌、响应、弃牌等决策
 */
var SGS = window.SGS = window.SGS || {};

SGS.AI = (function() {

    class AIPlayer {
        constructor() {
            this.personality = Math.random(); // 0-1，影响决策风格
        }

        // ========== 回合开始阶段处理 ==========
        // 观星/洛神/英魂/再起 现已统一由引擎 doBegin + doBeginInstantSkills 处理：
        // 观星、洛神 由引擎负责（人类走UI、AI走内联），英魂、再起 由 doBeginInstantSkills
        // 对所有玩家触发。此处不再重复处理，避免重复结算或人类玩家漏触发。

        // ========== 出牌阶段 ==========
        async handlePlayPhase(player, engine) {
            // 按优先级出牌
            let safetyCount = 0;
            while (safetyCount < 8) {  // 限制最多出8张牌
                safetyCount++;
                let action;
                try {
                    action = this.decideAction(player, engine);
                } catch(e) {
                    console.error('AI decideAction出错:', e);
                    break;
                }
                if (!action) break;
                try {
                    await this.executeAction(player, engine, action);
                } catch(e) {
                    console.error('AI executeAction出错:', e);
                    break;
                }
            }
        }

        decideAction(player, engine) {
            const handCards = [...player.handCards];
            if (handCards.length === 0) return null;

            // 优先级1：自己快死了用桃
            if (player.hp <= 1) {
                const tao = handCards.find(c => c.subtype === 'tao');
                if (tao && player.hp < player.maxHp) {
                    return { type: 'useCard', card: tao, targetIds: [] };
                }
            }

            // 优先级2：使用酒+杀（爆发）
            const jiu = handCards.find(c => c.subtype === 'jiu');
            const sha = handCards.find(c => c.subtype === 'sha');
            const targets = engine.getAttackTargets(player);
            if (jiu && sha && targets.length > 0 && !player.jiuUsedThisTurn) {
                const target = this.chooseBestTarget(player, engine, targets);
                if (target) {
                    return { type: 'useJiuThenSha', jiu, sha, targetIds: [target.id] };
                }
            }

            // 优先级3：使用杀
            if (player.shaUsedThisTurn < (player.shaLimitOverride || 1) || 
                player.skills.some(s => s.name === '咆哮') ||
                (player.equipment.weapon && player.equipment.weapon.subtype === 'zhuge')) {
                const shaCard = handCards.find(c => c.subtype === 'sha');
                if (shaCard && targets.length > 0) {
                    const target = this.chooseBestTarget(player, engine, targets);
                    if (target) {
                        return { type: 'useCard', card: shaCard, targetIds: [target.id] };
                    }
                }
            }

            // 优先级4：使用锦囊
            const trick = this.chooseBestTrick(player, engine, handCards);
            if (trick) return trick;

            // 优先级5：装备
            const equip = handCards.find(c => c.type === 'equip');
            if (equip) {
                return { type: 'useCard', card: equip, targetIds: [] };
            }

            // 优先级6：使用技能
            const skillAction = this.chooseSkillAction(player, engine);
            if (skillAction) return skillAction;

            // 优先级7：桃回血
            if (player.hp < player.maxHp) {
                const tao = handCards.find(c => c.subtype === 'tao');
                if (tao) {
                    return { type: 'useCard', card: tao, targetIds: [] };
                }
            }

            return null; // 结束出牌
        }

        chooseBestTarget(player, engine, targets) {
            // 优先攻击血量低的敌人
            const sorted = targets.filter(t => t.isAlive).sort((a, b) => a.hp - b.hp);
            // 身份局：攻击敌方
            if (engine.gameMode !== 'national') {
                if (player.identity === 'lord' || player.identity === 'loyal') {
                    // 主忠方优先打反贼和内奸
                    const enemies = sorted.filter(t => t.identity === 'rebel' || t.identity === 'spy');
                    if (enemies.length > 0) return enemies[0];
                } else if (player.identity === 'rebel') {
                    // 反贼优先打主公
                    const lord = sorted.find(t => t.identity === 'lord');
                    if (lord) return lord;
                    const loyals = sorted.filter(t => t.identity === 'loyal');
                    if (loyals.length > 0) return loyals[0];
                } else if (player.identity === 'spy') {
                    // 内奸：谁强打谁
                    return sorted[sorted.length - 1];
                }
                return sorted[0];
            } else {
                // 国战：打不同势力
                if (player.heroRevealed) {
                    const enemies = sorted.filter(t => !t.heroRevealed || t.faction !== player.faction);
                    if (enemies.length > 0) return enemies[0];
                }
                return sorted[0];
            }
        }

        chooseBestTrick(player, engine, handCards) {
            const targets = engine.getAlivePlayers().filter(p => p.id !== player.id);

            // 无中生有
            const wuzhong = handCards.find(c => c.subtype === 'wuzhong');
            if (wuzhong) {
                return { type: 'useCard', card: wuzhong, targetIds: [] };
            }

            // 南蛮入侵/万箭齐发（AOE）
            const aoe = handCards.find(c => c.subtype === 'nanman' || c.subtype === 'wanjian');
            if (aoe && engine.getAlivePlayers().length >= 3) {
                // 如果自己血量健康，使用AOE
                if (player.hp > 2) {
                    return { type: 'useCard', card: aoe, targetIds: [] };
                }
            }

            // 过河拆桥（拆敌人装备/手牌）
            const guohe = handCards.find(c => c.subtype === 'guohe');
            if (guohe) {
                const enemy = this.chooseBestTarget(player, engine, targets);
                if (enemy) {
                    return { type: 'useCard', card: guohe, targetIds: [enemy.id] };
                }
            }

            // 顺手牵羊
            const shunshou = handCards.find(c => c.subtype === 'shunshou');
            if (shunshou) {
                const closeEnemies = targets.filter(t => engine.getDistance(player, t) <= 1);
                if (closeEnemies.length > 0) {
                    return { type: 'useCard', card: shunshou, targetIds: [closeEnemies[0].id] };
                }
            }

            // 决斗
            const juedou = handCards.find(c => c.subtype === 'juedou');
            if (juedou) {
                const target = this.chooseBestTarget(player, engine, targets);
                if (target && player.handCards.filter(c => c.subtype === 'sha').length >= 2) {
                    return { type: 'useCard', card: juedou, targetIds: [target.id] };
                }
            }

            // 火攻
            const huogong = handCards.find(c => c.subtype === 'huogong');
            if (huogong) {
                const target = this.chooseBestTarget(player, engine, targets);
                if (target) {
                    return { type: 'useCard', card: huogong, targetIds: [target.id] };
                }
            }

            // 铁索连环
            const tiesuo = handCards.find(c => c.subtype === 'tiesuo');
            if (tiesuo && engine.getAlivePlayers().length >= 4) {
                const enemies = targets.filter(t => !t.isChained);
                if (enemies.length >= 2) {
                    return { type: 'useCard', card: tiesuo, targetIds: [enemies[0].id, enemies[1].id] };
                }
            }

            return null;
        }

        chooseSkillAction(player, engine) {
            const handCards = player.handCards;

            // 制衡：手牌不好时换牌
            if (player.skills.some(s => s.name === '制衡') && !player.skillStates.zhihengUsed) {
                const uselessCards = handCards.filter(c => {
                    return c.type === 'equip' && player.equipment[c.slot];
                });
                if (uselessCards.length >= 2) {
                    return { type: 'useSkill', skillName: '制衡', params: { cards: uselessCards } };
                }
                // 手牌多于体力时制衡
                if (handCards.length > player.hp + 2) {
                    const toDiscard = handCards.slice(0, handCards.length - player.hp);
                    return { type: 'useSkill', skillName: '制衡', params: { cards: toDiscard } };
                }
            }

            // 苦肉：黄盖（代价为失去1点体力，hp=1时使用会致死，故要求hp>=2）
            if (player.skills.some(s => s.name === '苦肉') && player.hp >= 2 &&
                !player.skillStates.kuruUsed && handCards.length < 3) {
                return { type: 'useSkill', skillName: '苦肉', params: {} };
            }

            // 反间
            if (player.skills.some(s => s.name === '反间') && !player.skillStates.fanjianUsed) {
                const targets = engine.getAttackTargets(player);
                if (targets.length > 0) {
                    return { type: 'useSkill', skillName: '反间', params: { targetId: targets[0].id } };
                }
            }

            // 青囊
            if (player.skills.some(s => s.name === '青囊') && !player.skillStates.qingnangUsed) {
                const injured = engine.getAlivePlayers().filter(p => p.hp < p.maxHp);
                if (injured.length > 0 && handCards.length > 2) {
                    const target = injured.find(p => p.id === player.id) || injured[0];
                    if (target) {
                        return { type: 'useSkill', skillName: '青囊', params: { targetId: target.id, card: handCards[0] } };
                    }
                }
            }

            // 仁德
            if (player.skills.some(s => s.name === '仁德') && !player.skillStates.rendeUsed && handCards.length >= 3) {
                const injuredAllies = this.findAllies(player, engine).filter(p => p.hp < p.maxHp);
                if (injuredAllies.length > 0) {
                    const cards = handCards.slice(0, 2);
                    return { type: 'useSkill', skillName: '仁德', params: { targetId: injuredAllies[0].id, cards } };
                }
            }

            // 结姻
            if (player.skills.some(s => s.name === '结姻') && !player.skillStates.jieyinUsed &&
                player.gender === 'female' && handCards.length >= 3) {
                const males = engine.getAlivePlayers().filter(p => p.gender === 'male' && p.hp < p.maxHp);
                if (males.length > 0 && player.hp < player.maxHp) {
                    return { type: 'useSkill', skillName: '结姻', params: { targetId: males[0].id, cards: [handCards[0], handCards[1]] } };
                }
            }

            // 离间
            if (player.skills.some(s => s.name === '离间') && !player.skillStates.lijianUsed &&
                player.gender === 'female' && handCards.length >= 2) {
                const males = engine.getAlivePlayers().filter(p => p.gender === 'male' && p.id !== player.id);
                if (males.length >= 2) {
                    return { type: 'useSkill', skillName: '离间', params: { targetId: males[0].id, targetId2: males[1].id, card: handCards[0] } };
                }
            }

            // 强袭
            if (player.skills.some(s => s.name === '强袭') && !player.skillStates.qiangxiUsed) {
                const targets = engine.getAttackTargets(player);
                if (targets.length > 0 && targets[0].hp <= 2) {
                    return { type: 'useSkill', skillName: '强袭', params: { targetId: targets[0].id } };
                }
            }

            // 据守
            if (player.skills.some(s => s.name === '据守') && !player.skillStates.jushouUsed &&
                player.hp > 2 && handCards.length < 3) {
                return { type: 'useSkill', skillName: '据守', params: {} };
            }

            return null;
        }

        findAllies(player, engine) {
            if (engine.gameMode === 'national') {
                return engine.getAlivePlayers().filter(p => p.faction === player.faction && p.id !== player.id);
            }
            if (player.identity === 'lord' || player.identity === 'loyal') {
                return engine.getAlivePlayers().filter(p => (p.identity === 'lord' || p.identity === 'loyal') && p.id !== player.id);
            }
            if (player.identity === 'rebel') {
                return engine.getAlivePlayers().filter(p => p.identity === 'rebel' && p.id !== player.id);
            }
            return []; // 内奸没有队友
        }

        async executeAction(player, engine, action) {
            try {
                switch (action.type) {
                    case 'useCard':
                        await engine.useCard(player, action.card.instanceId, action.targetIds);
                        break;
                    case 'useJiuThenSha':
                        await engine.useCard(player, action.jiu.instanceId, []);
                        await engine.useCard(player, action.sha.instanceId, action.targetIds);
                        break;
                    case 'useSkill':
                        await engine.useSkill(player, action.skillName, action.params);
                        break;
                }
            } catch(e) {
                console.error('executeAction内部错误:', e);
            }
            // 等待让UI更新（使用引擎统一定时器，便于销毁时清理，并尊重AI速度）
            await engine.delay(50);
        }

        // ========== 弃牌选择 ==========
        chooseDiscard(player, engine) {
            const handCards = [...player.handCards];
            if (handCards.length === 0) return null;

            // 优先弃：装备重复的、锦囊中价值低的
            const scored = handCards.map(c => {
                let score = 0;
                // 桃最不弃
                if (c.subtype === 'tao') score = 100;
                else if (c.subtype === 'shan') score = 80;
                else if (c.subtype === 'sha') score = 60;
                else if (c.type === 'equip') score = 40;
                else if (c.type === 'trick') score = 50;
                else if (c.subtype === 'jiu') score = 30;
                // 满血时桃价值降低
                if (c.subtype === 'tao' && player.hp >= player.maxHp) score = 20;
                return { card: c, score };
            });
            scored.sort((a, b) => a.score - b.score);
            return scored[0].card;
        }

        // ========== 响应决策 ==========
        shouldRespond(player, cardType, source, engine) {
            if (!player.isAlive || !source) return false;
            
            if (cardType === 'shan') {
                // 闪：优先闪避（除非快死了也要留桃）
                // 如果是AOE，可能选择不闪
                const hpRatio = player.hp / player.maxHp;
                if (hpRatio < 0.4) {
                    // 血少时一定闪
                    return true;
                }
                return true; // 简化：总是闪
            }
            
            if (cardType === 'sha') {
                // 响应决斗/南蛮：如果杀多就出
                const shaCount = player.handCards.filter(c => c.subtype === 'sha').length;
                if (shaCount >= 2) return true;
                // 如果是南蛮且血量健康
                if (player.hp > 2) return true;
                return false;
            }

            // 倾国（甄姬）：有黑色手牌则当作闪打出
            if (cardType === 'qinged') {
                const blackCards = player.handCards.filter(c => c.suit === 'spade' || c.suit === 'club');
                if (blackCards.length > 0) {
                    // 血少时更倾向保留黑色牌，但一般情况下都打出
                    return player.hp > 1;
                }
                return false;
            }
            
            return true;
        }

        // ========== 求桃决策 ==========
        shouldSaveTeammate(player, dyingPlayer, engine) {
            if (!player.isAlive) return false;
            // 如果是自己，一定救
            if (player.id === dyingPlayer.id) return true;
            // 如果是队友且自己血量健康
            const allies = this.findAllies(player, engine);
            if (allies.some(a => a.id === dyingPlayer.id)) {
                return player.hp > 2 || player.handCards.filter(c => c.subtype === 'tao').length > 1;
            }
            // 身份局：忠臣救主公
            if (engine.gameMode !== 'national') {
                if (player.identity === 'loyal' && dyingPlayer.identity === 'lord') return true;
                if (player.identity === 'lord' && dyingPlayer.identity === 'loyal' && player.hp > 2) return true;
            }
            return false;
        }

        // ========== 主公技：是否替主公打出闪/无懈 ==========
        shouldSaveLord(helper, lord, engine) {
            if (!helper || !helper.isAlive || !lord || !lord.isAlive) return false;
            // 忠心助手：在主公需要闪/无懈时替其打出（有对应牌即可替主公出）
            return true;
        }

        // ========== 主动技能是否发动（AI决策） ==========
        shouldUseSkill(player, skillName, engine) {
            if (!player || !player.isAlive) return false;
            // 大多数主动技能对AI有利，默认发动（除非游戏即将结束）
            if (engine && engine.getAlivePlayers && engine.getAlivePlayers().length <= 1) return false;
            return true;
        }

        // ========== 选将决策 ==========
        chooseHero(availableHeroes, engine, playerIdx) {
            // AI优先选强力武将
            const scored = availableHeroes.map(h => {
                let score = h.maxHp * 10;
                // 有主公技的当主公时加分
                if (playerIdx === 0 && h.skills.some(s => s.type === 'lord')) score += 30;
                // 强力技能加分
                for (const skill of h.skills) {
                    if (skill.name === '奸雄') score += 15;
                    if (skill.name === '反馈') score += 10;
                    if (skill.name === '遗计') score += 12;
                    if (skill.name === '武圣') score += 8;
                    if (skill.name === '咆哮') score += 12;
                    if (skill.name === '龙胆') score += 8;
                    if (skill.name === '观星') score += 10;
                    if (skill.name === '英姿') score += 8;
                    if (skill.name === '克己') score += 10;
                    if (skill.name === '空城') score += 8;
                    if (skill.name === '不屈') score += 8;
                }
                return { hero: h, score };
            });
            scored.sort((a, b) => b.score - a.score);
            // 加一点随机性
            const topN = Math.min(3, scored.length);
            return scored[Math.floor(Math.random() * topN)].hero;
        }

        // ========== 国战亮将 ==========
        maybeRevealNational(player, engine) {
            // AI亮将策略：血量低或需要发动技能时亮将
            if (player.hp <= 2 || Math.random() < 0.3) {
                player.heroRevealed = true;
                engine.log(`${player.name}亮出了${player.hero.name}！`, 'highlight');
                
                // 检查是否成为野心家
                const factionCount = engine.getAlivePlayers().filter(p => p.heroRevealed && p.faction === player.faction).length;
                const maxFaction = SGS.Config.getNationalMaxFaction(engine.playerCount);
                if (factionCount > maxFaction) {
                    player.isAmbitious = true;
                    engine.log(`${player.name}成为野心家！`, 'danger');
                }
            }
        }

        // ========== Ban选择 ==========
        chooseBanHeroes(allHeroes, count, engine) {
            // AI不主动ban，由玩家决定
            return [];
        }
    }

    return { AIPlayer };
})();
