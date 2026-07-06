/**
 * 三国杀核心游戏引擎
 * 处理游戏状态、回合流程、卡牌效果、技能系统
 */
var SGS = window.SGS = window.SGS || {};

SGS.GameEngine = (function() {

    // ========== 工具函数 ==========
    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function shuffleId(arr) {
        const copy = [...arr];
        shuffle(copy);
        // 保留每张牌既有的 instanceId（由 createDeck 赋值为 'c'+i，全局唯一且稳定）。
        // 切勿在此重新生成 instanceId：否则每次洗牌（牌堆耗尽时把弃牌堆洗回牌堆）都会改变
        // 卡牌身份，导致依赖 instanceId 的定位（handCards.find、装备/判定匹配、过牌/顺手选择等）
        // 在洗牌后失效，破坏卡牌守恒判定与玩家选择。
        return copy;
    }

    // ========== 玩家类 ==========
    class Player {
        constructor(id, name, isAI = false) {
            this.id = id;
            this.name = name;
            this.isAI = isAI;
            this.hero = null;
            this.nationalHero = null; // 国战副将
            this.hp = 0;
            this.maxHp = 0;
            this.handCards = [];
            this.equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
            this.judgmentCards = []; // 判定区的延时锦囊
            this.identity = null;
            this.faction = null;
            this.isAlive = true;
            this.isChained = false;   // 铁索连环
            this.isFlipped = false;   // 翻面
            this.shaUsedThisTurn = 0;
            this.jiuUsedThisTurn = false;
            this.alreadyDrew = false;
            this.drunk = false; // 酒效果：下一张杀+1伤害
            this.skillStates = {}; // 技能状态存储
            this.buquCards = []; // 周泰不屈牌
            this.tokens = {}; // 通用标记
            // 国战相关
            this.heroRevealed = false;
            this.isAmbitious = false; // 野心家
            this.zhulianbihe = false; // 珠联璧合标记
            this.pioneer = false; // 先驱标记
        }

        get handCount() { return this.handCards.length; }
        get hasWeapon() { return this.equipment.weapon !== null; }
        get weaponRange() {
            if (this.equipment.weapon) return this.equipment.weapon.range;
            return 1; // 默认攻击距离1
        }
        get distanceMod() {
            let mod = 0;
            if (this.equipment.horseMinus) mod -= 1;
            if (this.equipment.horsePlus) mod += 1;
            return mod;
        }
        // 技能列表
        get skills() {
            if (!this.hero) return [];
            return this.hero.skills || [];
        }
        get isLord() { return this.identity === 'lord'; }
    }

    // ========== 游戏引擎 ==========
    class GameEngine {
        constructor(config) {
            this.config = config;
            this.players = [];
            this.deck = [];
            this.discardPile = [];
            this.currentPlayerIdx = 0;
            this.phase = null;
            this.turnCount = 0;
            this.gameOver = false;
            this.winner = null;
            this.logs = [];
            this.eventSubscribers = {};
            // 注册与事件挂钩的武将技能监听（象兵/烈刃）
            this.on('onLoseEquip', (d) => { this._onLoseEquip(d); });
            this.on('onShaTarget', (d) => { this._onShaTarget(d); });
            this.adapter = null;
            this.ai = null;
            this.bannedHeroes = [];
            this.bannedCards = [];
            this.gameMode = config.mode || 'standard';
            this.playerCount = config.playerCount || 8;
            this.pickMode = config.pickMode || 'random';
            this.includeMilitary = config.includeMilitary !== false;
            this.waitingForHuman = false;
            this._pendingCardChoice = null; // 卡牌选择Promise解析器
            this._pendingExtraTurn = null;     // 放权：待插入的额外回合
            this._resumeAfterExtraTurn = null; // 放权：额外回合结束后应回归的玩家id
            this.aiSpeed = 1; // AI速度倍率：0.5(慢) - 3(快)，默认1
            // 对局日志系统
            this.matchId = null;
            this.matchLog = [];
            this.matchStartTime = null;
            this.matchEndTime = null;
            // 定时器追踪系统
            this._timers = [];
            this._destroyed = false;
        }

        setAdapter(adapter) {
            this.adapter = adapter;
        }

        setAI(ai) {
            this.ai = ai;
        }

        // 设置AI速度 (0.5-3)
        setAiSpeed(speed) {
            this.aiSpeed = Math.max(0.5, Math.min(3, speed));
            this.log(`AI速度已设置为：${this.aiSpeed}x`, 'normal');
        }

        // 延迟函数（考虑AI速度）
        delay(ms) {
            if (this._destroyed) return Promise.reject(new Error('Game destroyed'));
            const actualMs = ms / this.aiSpeed;
            return new Promise(resolve => {
                const id = setTimeout(() => {
                    const idx = this._timers.indexOf(id);
                    if (idx >= 0) this._timers.splice(idx, 1);
                    resolve();
                }, actualMs);
                this._timers.push(id);
            });
        }

        // 统一的定时器管理——所有setTimeout都必须通过此方法
        _setTimer(fn, ms) {
            if (this._destroyed) return null;
            const id = setTimeout(() => {
                const idx = this._timers.indexOf(id);
                if (idx >= 0) this._timers.splice(idx, 1);
                if (this._destroyed) return;
                fn();
            }, ms);
            this._timers.push(id);
            return id;
        }

        // ========== 日志 ==========
        log(msg, type = 'normal') {
            const entry = { msg, type, time: Date.now() };
            this.logs.push(entry);
            if (this.logs.length > 200) this.logs.shift();
            try {
                this.adapter && this.adapter.notifyEvent({ type: 'log', msg, _type: type });
            } catch(e) { console.error('log通知失败:', e); }
            // 同时记录到对局日志
            if (this.matchId) {
                this.addMatchEvent('game_log', { msg, type });
            }
        }

        // ========== 对局日志系统 ==========
        // 开始记录对局
        startMatchLog() {
            this.matchId = 'match_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            this.matchStartTime = Date.now();
            this.matchLog = [];
            this.addMatchEvent('match_start', {
                players: this.players.map(p => ({
                    name: p.name,
                    hero: p.hero.name,
                    isAI: p.isAI
                }))
            });
        }

        // 添加对局事件
        addMatchEvent(eventType, data) {
            if (!this.matchId) return;
            this.matchLog.push({
                eventType,
                data,
                time: Date.now(),
                phase: this.phase,
                currentPlayer: this.players[this.currentPlayerIdx]?.name
            });
        }

        // 保存对局记录到localStorage
        saveMatchLog(result) {
            if (!this.matchId) return;
            this.matchEndTime = Date.now();
            
            const matchRecord = {
                matchId: this.matchId,
                startTime: this.matchStartTime,
                endTime: this.matchEndTime,
                duration: this.matchEndTime - this.matchStartTime,
                players: this.players.map(p => ({
                    name: p.name,
                    hero: p.hero.name,
                    isAI: p.isAI,
                    identity: p.identity
                })),
                result: result, // 'win' or 'lose'
                log: this.matchLog
            };

            // 保存到localStorage
            try {
                let history = JSON.parse(localStorage.getItem('sgsMatchHistory') || '[]');
                history.unshift(matchRecord); // 最新的在前面
                // 只保留最近50场对局
                if (history.length > 50) history = history.slice(0, 50);
                localStorage.setItem('sgsMatchHistory', JSON.stringify(history));
                console.log('对局记录已保存:', this.matchId);
            } catch(e) {
                console.error('保存对局记录失败:', e);
            }
        }

        // 获取历史对局记录
        static getMatchHistory() {
            try {
                return JSON.parse(localStorage.getItem('sgsMatchHistory') || '[]');
            } catch(e) {
                return [];
            }
        }

        // 清除历史记录
        static clearMatchHistory() {
            localStorage.removeItem('sgsMatchHistory');
        }
        
        // 获取当前对局日志（用于实时上传）
        getMatchLog() {
            return {
                matchId: this.matchId,
                startTime: this.matchStartTime,
                players: this.players.map(p => ({
                    name: p.name,
                    hero: p.hero.name,
                    isAI: p.isAI,
                    identity: p.identity,
                    faction: p.faction
                })),
                log: this.matchLog
            };
        }
        
        // 实时上传日志片段到GitHub
        async uploadLogChunk() {
            if (!this.matchId) return;
            
            try {
                // 获取保存的token
                const token = localStorage.getItem('sgsGitHubToken');
                if (!token) return; // 没有token就不上传
                
                const logData = this.getMatchLog();
                const chunkId = 'chunk_' + Date.now();
                
                // 构建Issue内容
                const date = new Date();
                const body = `**实时日志片段**\n\n`;
                body += `\`\`\`json\n${JSON.stringify(logData, null, 2)}\n\`\`\`\n`;
                
                const issueData = {
                    title: `📊 实时日志 - ${chunkId} (${date.toLocaleTimeString('zh-CN')})`,
                    body: body,
                    labels: ['auto-submit', 'debug-log']
                };
                
                await fetch('https://api.github.com/repos/cjh-98/sanguosha-data/issues', {
                    method: 'POST',
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(issueData)
                });
                
                console.log('实时日志已上传:', chunkId);
            } catch(e) {
                // 静默失败，不影响游戏
                console.debug('实时日志上传失败:', e);
            }
        }
        
        // 启动实时日志上传定时器
        startRealtimeLogUpload(interval = 30000) {
            if (this._logUploadTimer) clearInterval(this._logUploadTimer);
            this._logUploadTimer = setInterval(() => this.uploadLogChunk(), interval);
        }
        
        // 停止实时日志上传
        stopRealtimeLogUpload() {
            if (this._logUploadTimer) {
                clearInterval(this._logUploadTimer);
                this._logUploadTimer = null;
            }
        }

        // 销毁引擎——清理所有异步定时器和资源
        destroy() {
            this._destroyed = true;
            // 清除实时上传定时器
            this.stopRealtimeLogUpload();
            // 清除所有通过 _setTimer 注册的 setTimeout
            this._timers.forEach(t => clearTimeout(t));
            this._timers = [];
            // 清理等待中的卡牌选择 Promise
            if (this._pendingCardChoice) {
                this._pendingCardChoice = null;
            }
            // 清除事件订阅者
            this.eventSubscribers = {};
            // 保存未结束的对局
            if (this.matchId && !this.gameOver) {
                this.matchEndTime = Date.now();
            }
        }

        // ========== 事件系统 ==========
        on(event, callback) {
            if (!this.eventSubscribers[event]) this.eventSubscribers[event] = [];
            this.eventSubscribers[event].push(callback);
        }

        emit(event, data) {
            const subs = this.eventSubscribers[event];
            if (subs) {
                for (const cb of subs) {
                    const result = cb(data);
                    if (result === false) return false; // 阻止事件
                }
            }
            return true;
        }

        // 象兵 (祝融, 限定技): 失去坐骑时摸3张牌
        _onLoseEquip(data) {
            try {
                const p = data && data.player;
                const card = data && data.card;
                if (!p || !p.isAlive || !card) return;
                if (!p.skills.some(s => s.name === '象兵')) return;
                if (card.subtype !== 'horse_plus' && card.subtype !== 'horse_minus') return;
                p.tokens = p.tokens || {};
                if (p.tokens['象兵used']) return;
                if (p.isAI) {
                    p.tokens['象兵used'] = true;
                    this.drawCard(p, 3);
                    this.log(`${p.name}发动【象兵】，失去坐骑，摸3张牌`, 'highlight');
                } else {
                    this.askSkillConfirm(p, '象兵', '你失去了坐骑，是否发动【象兵】摸3张牌？')
                        .then((want) => {
                            if (want && !p.tokens['象兵used']) {
                                p.tokens['象兵used'] = true;
                                this.drawCard(p, 3);
                                this.log(`${p.name}发动【象兵】，摸3张牌`, 'highlight');
                            }
                        }).catch(() => {});
                }
            } catch (e) { console.error('象兵:', e); }
        }

        // 烈刃 (祝融): 使用【杀】指定目标后，可与其拼点，赢则获得其一张牌
        _onShaTarget(data) {
            try {
                const source = data && data.source;
                const target = data && data.target;
                const card = data && data.card;
                if (!source || !source.isAlive || !target || !target.isAlive) return;
                if (!source.skills.some(s => s.name === '烈刃')) return;
                if (!card || card.subtype !== 'sha') return;
                const myCard = source.handCards[Math.floor(Math.random() * source.handCards.length)];
                const tCard = target.handCards[Math.floor(Math.random() * target.handCards.length)];
                if (!myCard || !tCard) return;
                this.log(`${source.name}(${myCard.number}) vs ${target.name}(${tCard.number}) 发动【烈刃】拼点`, 'normal');
                this.discardCard(source, myCard);
                this.discardCard(target, tCard);
                if (myCard.number > tCard.number) {
                    const taken = target.handCards.pop();
                    if (taken) {
                        source.handCards.push(taken);
                        this.log(`${source.name}【烈刃】拼点获胜，获得${target.name}一张牌`, 'success');
                    }
                } else {
                    this.log(`${source.name}【烈刃】拼点失败`, 'normal');
                }
            } catch (e) { console.error('烈刃:', e); }
        }

        // ========== 初始化游戏 ==========
        init() {
            try {
                // 创建牌堆
                this.deck = shuffleId(SGS.CardData.createDeck({
                    includeMilitary: this.includeMilitary,
                    bannedSubtypes: this.bannedCards,
                }));
                this.discardPile = [];

                // 创建玩家
                this.players = [];
                for (let i = 0; i < this.playerCount; i++) {
                    const isAI = i > 0; // 0号是人类玩家
                    const name = isAI ? this.getRandomAIName() : '你';
                    this.players.push(new Player(i, name, isAI));
                }

                // 分配身份
                this.assignIdentities();
                console.log('引擎init完成，玩家数:', this.players.length);
                return this;
            } catch(e) {
                console.error('引擎init失败:', e);
                throw e;
            }
        }

        getRandomAIName() {
            const names = SGS.Config.aiNames;
            return names[Math.floor(Math.random() * names.length)];
        }

        assignIdentities() {
            if (this.gameMode === 'national') {
                // 国战不分配身份，靠势力
                this.players.forEach(p => {
                    p.identity = null;
                    p.faction = null;
                });
                return;
            }
            const identities = shuffle([...SGS.Config.getIdentityList(this.playerCount)]);
            this.players.forEach((p, i) => {
                p.identity = identities[i];
            });
        }

        // 设置玩家武将
        setPlayerHero(playerIdx, hero, nationalHero = null) {
            const player = this.players[playerIdx];
            // 克隆武将对象，避免觉醒技等运行时对 player.skills 的修改污染全局 HeroData 定义
            // （否则同一页面内重开第二局时，武将会带着上一局已觉醒追加的技能）。
            player.hero = (hero && typeof hero === 'object') ? JSON.parse(JSON.stringify(hero)) : hero;
            player.nationalHero = (nationalHero && typeof nationalHero === 'object') ? JSON.parse(JSON.stringify(nationalHero)) : nationalHero;

            if (this.gameMode === 'national' && nationalHero) {
                // 国战体力 = 两将阴阳鱼之和取整
                const hp1 = hero.maxHp;
                const hp2 = nationalHero.maxHp;
                player.maxHp = Math.floor((hp1 + hp2) / 2);
                if (player.maxHp < 1) player.maxHp = 1;
            } else {
                player.maxHp = hero.maxHp;
                if (player.isLord && this.gameMode !== 'national' && this.playerCount >= 5) {
                    player.maxHp += 1;
                }
            }
            player.hp = player.maxHp;
            player.faction = hero.faction;
            // 统一用武将名作显示名（人机测试方便，联机时再覆盖人类玩家名）
            player.name = hero.name;

            // 触发游戏开始技能
            this.emit('gameStart', { player });
        }

        // ========== 开始游戏 ==========
        startGame() {
            try {
                // 检查所有玩家是否都有武将
                for (const player of this.players) {
                    if (!player.hero) {
                        this.log('错误：玩家' + player.name + '没有武将！', 'danger');
                    }
                }
                // 每人发4张起始手牌
                for (const player of this.players) {
                    for (let i = 0; i < 4; i++) {
                        this.drawCard(player);
                    }
                }

                // 主公亮明身份（身份局）
                if (this.gameMode !== 'national') {
                    const lord = this.players.find(p => p.isLord);
                    if (lord) {
                        this.currentPlayerIdx = this.players.indexOf(lord);
                        this.log(`${lord.name}(${lord.hero.name})是主公！`, 'highlight');
                    }
                }

                this.turnCount = 1;
                this.log('游戏开始！', 'highlight');
                this.startMatchLog(); // 开始记录对局
                this.startRealtimeLogUpload(30000); // 每30秒上传一次日志
                this.notifyState();
                this.startTurn();
            } catch(e) {
                console.error('startGame异常:', e);
                this.log('游戏启动异常: ' + e.message, 'danger');
                this.adapter && this.adapter.notifyEvent({type:'log', msg:'游戏启动异常: ' + e.message, _type:'danger'});
            }
        }

        // ========== 摸牌 ==========
        drawCard(player, count = 1) {
            const cards = [];
            for (let i = 0; i < count; i++) {
                if (this.deck.length === 0) {
                    // 重洗弃牌堆
                    if (this.discardPile.length === 0) {
                        this.log('牌堆已空！', 'danger');
                        break;
                    }
                    this.deck = shuffleId(this.discardPile);
                    this.discardPile = [];
                    this.log('弃牌堆洗入牌堆', 'normal');
                }
                const card = this.deck.pop();
                player.handCards.push(card);
                cards.push(card);
            }
            return cards;
        }

        // 从牌堆顶亮出一张牌（不进入手牌）
        revealTopCard() {
            if (this.deck.length === 0) {
                if (this.discardPile.length === 0) return null;
                this.deck = shuffleId(this.discardPile);
                this.discardPile = [];
            }
            return this.deck.pop();
        }

        // 动画桥接：将引擎事件转发给 UI 层播放动画
        _showAnim(type, data) {
            if (typeof window !== 'undefined' && window._onGameAnim) {
                window._onGameAnim(type, data);
            }
        }

        // ========== 弃牌 ==========
        discardCard(player, card) {
            const idx = player.handCards.indexOf(card);
            if (idx >= 0) {
                player.handCards.splice(idx, 1);
            }
            this.discardPile.push(card);
            // 连营 (陆逊)：弃牌后如无手牌则摸1张
            if (player.skills.some(s => s.name === '连营') && player.handCards.length === 0 && player.isAlive) {
                this.drawCard(player, 1);
                this.log(`${player.name}发动【连营】，摸了1张牌`, 'highlight');
            }
        }

        discardFromHand(player, card) {
            this.discardCard(player, card);
        }

        // ========== 卡牌选择（让玩家从一组牌中选择一张）==========
        // hideInfo: 是否隐藏卡牌信息（对手手牌显示为暗牌）
        async chooseCard(player, cards, prompt, hideInfo = false) {
            if (!cards || cards.length === 0) return null;
            if (cards.length === 1) return cards[0];
            if (player.isAI) {
                return this._aiChooseCard(player, cards);
            }
            // 人类玩家：等待UI选择
            return new Promise((resolve) => {
                let settled = false;
                let timer = null;
                // 保险：幂等 resolve + 30s 安全超时，确保引擎不会因 UI 未回调而永久挂起
                const safeResolve = (value) => {
                    if (settled) return;
                    settled = true;
                    if (timer) clearTimeout(timer);
                    this._pendingCardChoice = null;
                    resolve(value);
                };
                this._pendingCardChoice = { player, cards, prompt, resolve: safeResolve, hideInfo };
                timer = setTimeout(() => {
                    safeResolve(null);
                    const overlay = (typeof document !== 'undefined') ? document.getElementById('cardSelOverlay') : null;
                    if (overlay) overlay.style.display = 'none';
                }, 30000);
                // 立即通知UI更新，显示卡牌选择界面
                this.notifyState();
            });
        }

        _aiChooseCard(player, cards) {
            // AI选牌策略：优先选装备>基本牌>锦囊，同类按点数
            const equips = cards.filter(c => c.type === 'equip');
            if (equips.length > 0) return equips[0];
            const basics = cards.filter(c => c.type === 'basic');
            if (basics.length > 0) return basics[0];
            return cards[Math.floor(Math.random() * cards.length)];
        }

        // 选择目标角色（异步，人类弹出选择UI）
        async chooseTarget(player, targets, prompt) {
            if (!targets || targets.length === 0) return null;
            if (targets.length === 1) return targets[0];
            if (player.isAI) {
                return targets[Math.floor(Math.random() * targets.length)];
            }
            return new Promise((resolve) => {
                let settled = false;
                let timer = null;
                // 保险：幂等 resolve + 30s 安全超时，确保引擎不会因 UI 未回调而永久挂起
                const safeResolve = (value) => {
                    if (settled) return;
                    settled = true;
                    if (timer) clearTimeout(timer);
                    this._pendingTargetChoice = null;
                    resolve(value);
                };
                this._pendingTargetChoice = { player, targets, prompt, resolve: safeResolve };
                timer = setTimeout(() => {
                    safeResolve(null);
                    const overlay = (typeof document !== 'undefined') ? document.getElementById('targetSelOverlay') : null;
                    if (overlay) overlay.style.display = 'none';
                }, 30000);
                this.notifyState();
            });
        }

        // ========== 技能发动确认 ==========
        // 统一技能确认接口：满足条件时，人类玩家弹窗询问是否发动；AI 走策略。
        // 返回 Promise<boolean>：true=发动，false=不发动
        async askSkillConfirm(player, skillName, desc) {
            if (!player) return false;
            if (player.isAI) {
                // AI 决策：使用 AI 策略，否则默认 50% 发动
                if (this.ai && typeof this.ai.shouldUseSkill === 'function') {
                    return this.ai.shouldUseSkill(player, skillName, this);
                }
                return Math.random() < 0.5;
            }
            // 人类玩家：弹出确认对话框，等待用户点击
            return new Promise((resolve) => {
                let settled = false;
                let timer = null;
                // 保险：幂等 resolve + 30s 安全超时 + 弹窗缺失兜底，确保引擎不会死锁
                const safeResolve = (value) => {
                    if (settled) return;
                    settled = true;
                    if (timer) clearTimeout(timer);
                    resolve(value);
                };
                if (typeof window !== 'undefined' && typeof window.showSkillConfirmModal === 'function') {
                    window.showSkillConfirmModal(skillName, desc, player.id, safeResolve);
                } else {
                    // UI 不可用：立即按"不发动"处理，绝不挂起
                    safeResolve(false);
                    return;
                }
                timer = setTimeout(() => {
                    safeResolve(false);
                    const overlay = (typeof document !== 'undefined') ? document.getElementById('skillConfirmOverlay') : null;
                    if (overlay) overlay.style.display = 'none';
                }, 30000);
            });
        }

        // 获取技能描述文本（从英雄定义中查找）
        getSkillDesc(heroId, skillName) {
            const hero = SGS.HeroData.heroes.find(h => h.id === heroId);
            if (!hero) return '';
            const sk = (hero.skills || []).find(s => s.name === skillName);
            return sk ? sk.desc : '';
        }

        // ========== 距离计算 ==========
        getDistance(from, to) {
            if (from.id === to.id) return 0;
            const alivePlayers = this.players.filter(p => p.isAlive);
            const aliveIdx = alivePlayers.map(p => p.id);
            const fromIdx = aliveIdx.indexOf(from.id);
            const toIdx = aliveIdx.indexOf(to.id);
            if (fromIdx < 0 || toIdx < 0) return Infinity;

            const n = alivePlayers.length;
            // 环形距离（取较短方向）
            let dist = Math.abs(fromIdx - toIdx);
            dist = Math.min(dist, n - dist);

            // 装备修正
            dist += to.distanceMod; // 目标的+1马增加距离
            if (from.equipment.horseMinus) dist -= 1; // 自己的-1马减少距离
            // 马术 (马超)：攻击距离-1
            if (from.skills.some(s => s.name === '马术')) dist -= 1;
            dist = Math.max(1, dist); // 最小为1
            return dist;
        }

        getAttackRange(player) {
            return player.weaponRange;
        }

        canAttack(attacker, target) {
            if (!attacker || !target || !target.isAlive) return false;
            return this.getDistance(attacker, target) <= this.getAttackRange(attacker);
        }

        // 获取所有存活玩家
        getAlivePlayers() {
            return this.players.filter(p => p.isAlive);
        }

        // 获取攻击范围内的目标
        getAttackTargets(attacker) {
            return this.getAlivePlayers().filter(p => p.id !== attacker.id && this.canAttack(attacker, p));
        }

        // ========== 回合管理 (状态机模式 - 彻底告别async链) ==========
        startTurn() {
            if (this._destroyed) return;
            if (this.gameOver) return;
            const player = this.players[this.currentPlayerIdx];
            if (!player) { this.nextTurn(); return; }
            if (!player.isAlive) { this.nextTurn(); return; }
            if (player.isFlipped) {
                player.isFlipped = false;
                this.log(`${player.name}被翻面，跳过回合`, 'normal');
                this.nextTurn();
                return;
            }

            player.shaUsedThisTurn = 0;
            player.jiuUsedThisTurn = false;
            player.drunk = false;
            player.alreadyDrew = false;
            // 重置技能状态
            player.skillStates = {};
            // 天义(太史慈)出杀上限：每回合重置；放权(刘禅)待定标记每回合清理
            player.shaLimitOverride = 0;
            player._fangquanPending = false;
            // 清除上回合可能遗留的_phase skip 标记（神速会在本回合 doBegin 中按需重新设置）
            player._skipJudge = false;
            player._skipDraw = false;
            player._skipPlay = false;

            this.phase = SGS.Config.PHASE.BEGIN;
            this.log(`── ${player.name}(${player.hero.name})的回合 ──`, 'highlight');
            this.notifyState();
            // 直接调用stepTurn，不使用setTimeout
            this.stepTurn();
        }

        // 状态机核心：根据当前phase执行对应函数
        stepTurn() {
            if (this._destroyed) return;
            if (this.gameOver) return;
            // 检查是否在等待人类玩家操作
            if (this._waitingForLuoshen || this._waitingForGuicai || this._waitingForGuidao) {
                return; // 阻塞，等待人类玩家响应
            }
            try {
                const player = this.players[this.currentPlayerIdx];
                if (!player || !player.isAlive) { this.nextTurn(); return; }

                switch (this.phase) {
                    case 'begin':   this.doBegin(player); break;
                    case 'judge':   this.doJudge(player); break;
                    case 'draw':    this.doDraw(player); break;
                    case 'play':    this.doPlay(player); break;
                    case 'discard': this.doDiscard(player); break;
                    case 'end':     this.doEnd(player); break;
                    default:
                        console.error('未知phase:', this.phase);
                        this.nextTurn();
                }
            } catch(e) {
                console.error('stepTurn异常 phase=' + this.phase + ':', e);
                this.log('阶段异常(' + this.phase + ')，跳过', 'danger');
                this.advancePhase();
            }
        }

        // 推进到下一阶段
        advancePhase() {
            if (this._destroyed) return;
            const order = ['begin','judge','draw','play','discard','end'];
            const idx = order.indexOf(this.phase);
            if (idx < 0 || idx >= order.length - 1) {
                // 已到最后，进入下一回合
                this.nextTurn();
            } else {
                this.phase = order[idx + 1];
                this.notifyState();
                // 添加延迟让玩家看清阶段变化（使用aiSpeed倍率）
                const delayMs = 300 / this.aiSpeed;
                this._setTimer(() => {
                    this.stepTurn();
                }, delayMs);
            }
        }

        // === 各阶段实现（全部同步，human 的技能确认走 await） ===
        async doBegin(player) {
            // 回合开始技能
            try { this.emit('turnBegin', { player, engine: this }); } catch(e){}
            // 国战亮将
            if (this.gameMode === 'national' && !player.heroRevealed) {
                if (player.isAI && this.ai) {
                    try { this.ai.maybeRevealNational(player, this); } catch(e){}
                }
            }
            // 回合开始：无UI交互类技能（英魂/再起）对所有玩家均触发，置于观星/洛神之前
            this.doBeginInstantSkills(player);
            // 觉醒技：定义 type 为 AWAKENING 且体力=1 时由引擎统一触发（魂姿/志继/若愚/凿险）
            this.doBeginAwakeningSkills(player);
            // 神速 (夏侯渊)：跳过判定和摸牌阶段，视为使用一张【杀】
            if (player.skills.some(s => s.name === '神速')) {
                const want = player.isAI ? true
                    : await this.askSkillConfirm(player, '神速', '是否发动【神速】跳过判定和摸牌阶段，视为使用一张【杀】？');
                if (want) {
                    player._skipJudge = true;
                    player._skipDraw = true;
                    const targets = this.getAttackTargets(player);
                    if (targets.length > 0) {
                        this.log(`${player.name}发动【神速】，视为使用一张杀`, 'highlight');
                        await this.resolveSha(player, targets[0],
                            { name:'杀(神速)', subtype:'sha', element:'normal', suit:'spade', number:0, instanceId:'sx_'+Date.now(), uid:'sx' }, 1);
                    } else {
                        this.log(`${player.name}发动神速，但没有攻击目标`, 'normal');
                    }
                }
            }
            // 放权 (刘禅)：跳过本回合出牌阶段，回合结束时令一名角色进行额外回合
            if (player.skills.some(s => s.name === '放权')) {
                const want = player.isAI ? true
                    : await this.askSkillConfirm(player, '放权', '是否发动【放权】跳过本回合出牌阶段，回合结束时令一名角色进行额外回合？');
                if (want) {
                    player._skipPlay = true;
                    player._fangquanPending = true;
                    this.log(`${player.name}发动【放权】，将跳过出牌阶段`, 'highlight');
                }
            }
            // 观星 (诸葛亮) - 主动技，人类玩家需要UI交互
            if (player.skills.some(s => s.name === '观星')) {
                if (player.isAI) {
                    // AI自动观星（简化版）
                    const n = Math.min(5, this.deck.length);
                    if (n > 0) {
                        const stars = this.deck.slice(-n);
                        this.deck = this.deck.slice(0, -n);
                        shuffleId(stars);
                        this.deck = this.deck.concat(stars);
                        this.log(`${player.name}发动【观星】，观看了牌堆顶的${n}张牌并调整顺序`, 'highlight');
                    }
                } else {
                    // 人类玩家：设置等待状态，让UI可以响应
                    this._waitingForGuanxing = true;
                    this._guanxingPlayer = player;
                    this.notifyState();
                    // 弹出UI询问
                    this._setTimer(() => {
                        if (window.openGuanxing) {
                            window.openGuanxing();
                        }
                    }, 100);
                    // 不调用advancePhase，等待UI调用finishGuanxing
                    return;
                }
            }
            // 洛神 (甄姬) - 主动技，人类玩家可以控制是否继续
            if (player.skills.some(s => s.name === '洛神')) {
                if (player.isAI) {
                    // AI自动洛神
                    this.log(`${player.name}发动【洛神】`, 'highlight');
                    
                    let continueLuoshen = true;
                    let safety = 0;
                    while (continueLuoshen && safety < 20) {
                        safety++;
                        const judgeCard = this.revealTopCard();
                        if (!judgeCard) {
                            this.log(`${player.name}洛神判定：牌堆已空，洛神结束`, 'normal');
                            break;
                        }
                        
                        const cardInfo = `${SGS.CardData.suitName[judgeCard.suit]}${SGS.CardData.numberName[judgeCard.number]}`;
                        this.log(`${player.name}洛神判定：${cardInfo}`, 'normal');
                        
                        if (judgeCard.suit === 'spade' || judgeCard.suit === 'club') {
                            player.handCards.push(judgeCard);
                            this.log(`${player.name}获得♠/♣，可以继续洛神`, 'highlight');
                        } else {
                            this.discardPile.push(judgeCard);
                            this.log(`${player.name}得到♥/♦，洛神结束`, 'normal');
                            continueLuoshen = false;
                        }
                    }
                    this.notifyState();
                    this.advancePhase();
                } else {
                    // 人类玩家：检查是否已经在等待状态
                    if (this._waitingForLuoshen) {
                        // 已经在等待，不重复设置
                        return;
                    }
                    // 设置等待状态，让UI可以响应
                    this._waitingForLuoshen = true;
                    this._luoshenPlayer = player;
                    this.notifyState();
                    // 弹出UI询问
                    this._setTimer(() => {
                        if (window.openLuoshenUI) {
                            window.openLuoshenUI();
                        }
                    }, 100);
                    // 不调用advancePhase，等待UI调用finishLuoshen
                    return;
                }
            }
            this.notifyState();
            this.advancePhase();
        }

        // 回合开始阶段：觉醒技（AWAKENING），对所有玩家均触发
        doBeginAwakeningSkills(player) {
            for (const skill of player.skills) {
                if (skill.type !== SGS.HeroData.SKILL_TYPE.AWAKENING) continue;
                // 默认觉醒条件：体力为1
                let canTrigger = (player.hp === 1);
                // 神威（神吕布）：觉醒条件为"狂暴"标记达到6
                if (skill.name === '神威') {
                    canTrigger = (player.tokens['狂暴'] || 0) >= 6;
                }
                if (canTrigger) {
                    try {
                        this.log(`${player.name}满足了觉醒技【${skill.name}】的条件`, 'highlight');
                        this.useSkill(player, skill.name, {});
                    } catch(e) {
                        console.error('doBeginAwakeningSkills:', e);
                    }
                }
            }
        }

        // 回合开始阶段：无UI交互类技能（英魂/再起），对所有玩家均触发
        doBeginInstantSkills(player) {
            // 英魂 (孙坚)：受伤时摸 X 弃 X-1（X = 已损失体力）
            if (player.skills.some(s => s.name === '英魂') && player.hp < player.maxHp) {
                const x = player.maxHp - player.hp;
                if (x >= 1) {
                    this.drawCard(player, x);
                    const discardCount = x - 1;
                    for (let i = 0; i < discardCount && player.handCards.length > 0; i++) {
                        const card = this.ai ? this.ai.chooseDiscard(player, this)
                                             : player.handCards[player.handCards.length - 1];
                        if (card) this.discardCard(player, card);
                    }
                    this.log(`${player.name}发动【英魂】`, 'highlight');
                }
            }
            // 再起：翻牌堆顶，若为红色则回1体力并获取该牌，否则置入弃牌堆
            if (player.skills.some(s => s.name === '再起') && player.hp < player.maxHp) {
                const card = this.revealTopCard();
                if (card) {
                    if (card.suit === 'heart' || card.suit === 'diamond') {
                        this.heal(player, 1);
                        player.handCards.push(card);
                        this.log(`${player.name}【再起】，翻到红牌，回1体力并获得该牌`, 'success');
                    } else {
                        this.discardPile.push(card);
                        this.log(`${player.name}【再起】，翻到黑牌，牌置入弃牌堆`, 'normal');
                    }
                }
            }
            // 凿险觉醒赐予的"屯田"：每回合开始摸1张牌（持久标记，不受 skillStates 重置影响）
            if (player.hasZaoXianTuntian) {
                this.drawCard(player, 1);
                this.log(`${player.name}【屯田】摸了1张牌`, 'highlight');
            }
        }

        async doJudge(player) {
            // 神速 (夏侯渊)：跳过判定阶段
            if (player._skipJudge) {
                player._skipJudge = false;
                this.log(`${player.name}神速：跳过判定阶段`, 'normal');
                this.advancePhase();
                return;
            }
            // 依次处理判定区
            try {
                while (player.judgmentCards.length > 0) {
                    const judgeCard = player.judgmentCards.shift();
                    await this.resolveJudgment(player, judgeCard);

                    // 检查是否在等待人类玩家操作（鬼才/鬼道）
                    if (this._waitingForGuicai || this._waitingForGuidao) {
                        return; // 阻塞，等待人类玩家响应
                    }
                }
            } catch(e) { console.error('doJudge:', e); }
            this.notifyState();
            this.advancePhase();
        }

        async doDraw(player) {
            try {
                if (player._skipDraw) {
                    player._skipDraw = false;
                    this.log(`${player.name}跳过摸牌阶段`, 'normal');
                } else {
                    let drawCount = 2;
                    // 英姿 (周瑜): 多摸1张
                    if (player.skills.some(s => s.name === '英姿')) drawCount += 1;
                    // 好施 (鲁肃): 若手牌少于5张，多摸2张
                    if (player.skills.some(s => s.name === '好施') && player.handCards.length < 5) {
                        drawCount += 2;
                        this.log(`${player.name}发动好施，多摸2张牌`, 'highlight');
                    }
                    // 裸衣 (许褚): 主动技，少摸1张牌，本回合杀/决斗伤害+1
                    if (player.skills.some(s => s.name === '裸衣')) {
                        const want = player.isAI ? true : await this.askSkillConfirm(player, '裸衣', '是否发动【裸衣】少摸1张牌，本回合杀/决斗伤害+1？');
                        if (want) {
                            drawCount -= 1;
                            player.luoyiActive = true;  // 标记本回合杀/决斗伤害+1
                            this.log(`${player.name}发动裸衣，少摸1张牌，本回合杀/决斗伤害+1`, 'highlight');
                        }
                    }
                    // 突袭 (张辽): 少摸1张，改为从1-2名其他角色获得手牌
                    if (player.skills.some(s => s.name === '突袭')) {
                        drawCount -= 1;
                        const others = this.getAlivePlayers().filter(p => p.id !== player.id && p.handCards.length > 0);
                        if (others.length > 0) {
                            const pickCount = Math.min(2, others.length);
                            const picked = others.sort(() => Math.random() - 0.5).slice(0, pickCount);
                            for (const p of picked) {
                                const c = p.handCards[Math.floor(Math.random() * p.handCards.length)];
                                p.handCards.splice(p.handCards.indexOf(c), 1);
                                player.handCards.push(c);
                                this.log(`${player.name}突袭：获得${p.name}的${c.name}`, 'highlight');
                            }
                        } else {
                            this.log(`${player.name}突袭：无目标可偷`, 'normal');
                        }
                    }
                    try { this.emit('drawPhase', { player, drawCount, engine: this, modify: (n) => { drawCount = n; } }); } catch(e){}
                    if (drawCount > 0) {
                        this.drawCard(player, drawCount);
                        this.log(`${player.name}摸了${drawCount}张牌`, 'normal');
                    }
                    player.alreadyDrew = true;
                }
            } catch(e) { console.error('doDraw:', e); }
            this.notifyState();
            this.advancePhase();
        }

        doPlay(player) {
            try {
                if (player._skipPlay) {
                    player._skipPlay = false;
                    this.log(`${player.name}跳过出牌阶段`, 'normal');
                    this.advancePhase();
                    return;
                }
                this.emit('playPhase', { player, engine: this });
                this.notifyState();

                if (player.isAI && this.ai) {
                    // AI出牌：使用异步循环
                    this.aiPlayLoop(player);
                }
                // 人类玩家：等待UI操作，不自动推进
            } catch(e) {
                console.error('doPlay:', e);
                this.advancePhase();
            }
        }

        // AI出牌：循环执行，每次出一张牌后等待延迟
        async aiPlayLoop(player) {
            let count = 0;
            while (count < 8 && !this.gameOver && player.isAlive) {
                count++;
                try {
                    const action = this.ai.decideAction(player, this);
                    if (!action) { break; }

                    await this.ai.executeAction(player, this, action);
                    this.notifyState();

                    // 添加延迟让玩家看清AI操作（使用aiSpeed倍率）
                    const delayMs = 500 / this.aiSpeed;
                    await this.delay(delayMs);
                } catch(e) {
                    console.error('AI executeAction:', e);
                    break;
                }
            }
            this.advancePhase();
        }

        async doDiscard(player) {
            try {
                this.emit('discardPhase', { player, engine: this });
                let handLimit = player.hp;
                // 血裔 (袁绍 主公技): 手牌上限+X (X为群势力角色数*2)
                if (player.skills.some(s => s.name === '血裔')) {
                    const qunCount = this.getAlivePlayers().filter(p => p.faction === 'qun').length;
                    handLimit += qunCount * 2;
                }
                // 克己
                if (player.shaUsedThisTurn === 0 && player.skills.some(s => s.name === '克己')) {
                    this.log(`${player.name}发动克己，不弃牌`, 'success');
                    this.advancePhase();
                    return;
                }
                // AI自动弃牌
                if (player.isAI) {
                    let safety = 0;
                    while (player.handCards.length > handLimit && safety < 20) {
                        safety++;
                        const card = this.ai.chooseDiscard(player, this);
                        if (card) {
                            this.discardCard(player, card);
                            this.notifyState();
                            // 添加延迟让玩家看清弃牌（使用aiSpeed倍率）
                            const delayMs = 200 / this.aiSpeed;
                            await this.delay(delayMs);
                        } else if (player.handCards.length > 0) {
                            this.discardCard(player, player.handCards[player.handCards.length - 1]);
                            this.notifyState();
                            const delayMs = 200 / this.aiSpeed;
                            await this.delay(delayMs);
                        }
                    }
                    this.advancePhase();
                } else {
                    // 人类弃牌：等UI
                    if (player.handCards.length > handLimit) {
                        this.waitingForHuman = true;
                        this.adapter && this.adapter.notifyEvent({ type: 'needDiscard', count: player.handCards.length - handLimit });
                        // 不推进，等UI调 finishDiscard
                    } else {
                        this.advancePhase();
                    }
                }
            } catch(e) {
                console.error('doDiscard:', e);
                this.advancePhase();
            }
        }

        async doEnd(player) {
            try { this.emit('turnEnd', { player, engine: this }); } catch(e){}

            // 重置裸衣标记
            player.luoyiActive = false;

            // 闭月 (貂蝉)
            if (player.skills.some(s => s.name === '闭月')) {
                this.drawCard(player, 1);
                this.log(`${player.name}发动【闭月】，摸了1张牌`, 'highlight');
            }

            // 崩坏 (董卓) — 锁定技，回合结束若体力不是全场最少，失去1点体力
            if (player.skills.some(s => s.name === '崩坏')) {
                const minHp = Math.min(...this.getAlivePlayers().map(p => p.hp));
                if (player.hp > minHp) {
                    player.hp -= 1;
                    this.log(`${player.name}崩坏：失去1点体力`, 'danger');
                    if (player.hp <= 0) { await this.handleDying(player, player); }
                } else {
                    this.log(`${player.name}崩坏：体力已是最低，不触发`, 'normal');
                }
            }

            // 放权 (刘禅)：回合结束时弃一张牌，令一名角色进行一个额外回合
            if (player._fangquanPending && !this.gameOver && this.getAlivePlayers().length > 1) {
                player._fangquanPending = false;
                const candidates = this.getAlivePlayers().filter(p => p.id !== player.id);
                let fqTarget = null;
                if (player.isAI) {
                    if (player.handCards.length > 0) {
                        this.discardCard(player, player.handCards[0]);
                        fqTarget = candidates[Math.floor(Math.random() * candidates.length)];
                    }
                } else if (player.handCards.length > 0) {
                    const dc = await this.chooseCard(player, player.handCards, '放权：弃一张牌，令一名角色进行额外回合');
                    if (dc) {
                        this.discardCard(player, dc);
                        fqTarget = await this.chooseTarget(player, candidates, '放权：选择进行额外回合的角色');
                    }
                }
                if (fqTarget) {
                    const alive = this.getAlivePlayers();
                    const lcIdx = alive.findIndex(p => p.id === player.id);
                    const normalNext = alive[(lcIdx + 1) % alive.length];
                    this._pendingExtraTurn = { targetId: fqTarget.id, resumeAfterId: normalNext.id };
                    this.log(`${player.name}发动放权，令${fqTarget.name}进行一个额外回合`, 'highlight');
                }
            }

            if (this.checkGameOver()) { this.endGame(); return; }
            this.notifyState();
            this.nextTurn();
        }

        // 人类玩家完成弃牌后调用
        finishDiscard(player, cards) {
            for (const card of cards) {
                this.discardCard(player, card);
            }
            this.log(`${player.name}弃了${cards.length}张牌`, 'normal');
            this.waitingForHuman = false;
            this.advancePhase();
        }

        async resolveJudgment(player, judgeCard) {
            const judgeResult = this.revealTopCard();
            if (!judgeResult) return;
            // 动画：判定抽牌
            this._showAnim('judgeDraw', { player, card: judgeResult });
            let finalResult = judgeResult;
            this.log(`${player.name}判定${judgeCard.name}：${SGS.CardData.suitName[judgeResult.suit]}${SGS.CardData.numberName[judgeResult.number]}`, 'normal');
            try { this.emit('onJudge', { player, judgeCard, judgeResult, engine: this, setResult: (c) => { finalResult = c; } }); } catch(e){}

            // 鬼才 (司马懿) - 主动技，人类玩家需要UI交互选择是否替换
            if (player.skills.some(s => s.name === '鬼才') && player.handCards.length > 0) {
                if (player.isAI) {
                    // AI自动判断是否替换
                    const isBad = (judgeCard.subtype === 'lebusi' && finalResult.suit !== 'heart') ||
                                (judgeCard.subtype === 'bingliang' && finalResult.suit === 'club');
                    if (isBad && Math.random() < 0.7) {
                        const chosen = player.handCards[Math.floor(Math.random() * player.handCards.length)];
                        player.handCards.splice(player.handCards.indexOf(chosen), 1);
                        finalResult = chosen;
                        this.log(`${player.name}发动鬼才，替换了判定牌为${SGS.CardData.suitName[chosen.suit]}${SGS.CardData.numberName[chosen.number]}`, 'highlight');
                    }
                } else {
                    // 人类玩家：显示判定结果，询问是否替换
                    this.log(`${player.name}可以发动【鬼才】替换判定牌`, 'normal');
                    // 等待UI交互
                    this._waitingForGuicai = true;
                    this._guicaiPlayer = player;
                    this._guicaiJudgeCard = judgeCard;
                    this._guicaiOriginalResult = finalResult;
                    this._guicaiFinalResult = finalResult;
                    this.notifyState();
                    // 不阻塞流程，但需要等待UI响应
                    return;
                }
            }
            // 鬼道 (张角) - 主动技，人类玩家需要UI交互选择是否替换
            if (player.skills.some(s => s.name === '鬼道') && player.handCards.some(c => c.suit === 'spade')) {
                if (player.isAI) {
                    const isBad = (judgeCard.subtype === 'lebusi' && finalResult.suit !== 'heart') ||
                                (judgeCard.subtype === 'bingliang' && finalResult.suit === 'club');
                    if (isBad && Math.random() < 0.7) {
                        const spadeCards = player.handCards.filter(c => c.suit === 'spade');
                        const chosen = spadeCards[Math.floor(Math.random() * spadeCards.length)];
                        player.handCards.splice(player.handCards.indexOf(chosen), 1);
                        finalResult = chosen;
                        this.log(`${player.name}发动鬼道，替换了判定牌为${SGS.CardData.suitName[chosen.suit]}${SGS.CardData.numberName[chosen.number]}`, 'highlight');
                    }
                } else {
                    // 人类玩家：显示判定结果，询问是否替换（需要打出黑色牌）
                    this.log(`${player.name}可以发动【鬼道】替换判定牌（需打出黑色牌）`, 'normal');
                    // 等待UI交互
                    this._waitingForGuidao = true;
                    this._guidaoPlayer = player;
                    this._guidaoJudgeCard = judgeCard;
                    this._guidaoOriginalResult = finalResult;
                    this._guidaoFinalResult = finalResult;
                    this.notifyState();
                    // 不阻塞流程，但需要等待UI响应
                    return;
                }
            }

            // 天妒 (郭嘉)：获得判定牌——优先入其手牌，不再入弃牌堆，避免同一张牌同时存在于手牌与弃牌堆（卡牌守恒）
            if (player.skills.some(s => s.name === '天妒')) {
                player.handCards.push(finalResult);
                this.log(`${player.name}发动天妒，获得了判定牌${finalResult.name}`, 'highlight');
            } else {
                this.discardPile.push(finalResult);
            }
            if (finalResult !== judgeResult) { this.discardPile.push(judgeResult); }

            switch (judgeCard.subtype) {
                case 'lebusi':
                    if (finalResult.suit !== 'heart') {
                        this.log(`${player.name}被乐不思蜀`, 'danger');
                        player._skipPlay = true;
                    }
                    break;
                case 'bingliang':
                    if (finalResult.suit !== 'club') {
                        this.log(`${player.name}被兵粮寸断`, 'danger');
                        player._skipDraw = true;
                    }
                    break;
                case 'shandian':
                    if (finalResult.suit === 'spade' && finalResult.number >= 2 && finalResult.number <= 9) {
                    this.log(`${player.name}被闪电击中！3点雷伤害`, 'danger');
                    await this.dealDamage(player, 3, { source: null, element: 'thunder', card: judgeCard });
                    this.discardPile.push(judgeCard);
                    } else {
                        const nextPlayer = this.getNextPlayer(player);
                        if (nextPlayer) {
                            nextPlayer.judgmentCards.unshift(judgeCard);
                        } else {
                            this.discardPile.push(judgeCard);
                        }
                    }
                    return;
            }
            this.discardPile.push(judgeCard);
        }

        getNextPlayer(fromPlayer) {
            const alive = this.getAlivePlayers();
            const idx = alive.findIndex(p => p.id === fromPlayer.id);
            if (idx < 0) return null;
            return alive[(idx + 1) % alive.length];
        }

        async nextTurn() {
            if (this._destroyed) return;
            if (this.gameOver) return;

            // 放权 (刘禅) 额外回合衔接：
            // 1) 上一回合设置了额外回合 → 让目标立即行动，并记下回归点
            if (this._pendingExtraTurn) {
                const pend = this._pendingExtraTurn;
                this._pendingExtraTurn = null;
                this._resumeAfterExtraTurn = pend.resumeAfterId;
                const aliveP = this.getAlivePlayers();
                const idx = aliveP.findIndex(p => p.id === pend.targetId);
                if (idx >= 0) {
                    this.currentPlayerIdx = this.players.indexOf(aliveP[idx]);
                    this.turnCount++;
                    await this.delay(500 / this.aiSpeed);
                    this.startTurn();
                    return;
                }
            }
            // 2) 额外回合结束后 → 回归到原本该行动的下一位玩家
            if (this._resumeAfterExtraTurn != null) {
                const resumeId = this._resumeAfterExtraTurn;
                this._resumeAfterExtraTurn = null;
                const aliveR = this.getAlivePlayers();
                const idx = aliveR.findIndex(p => p.id === resumeId);
                if (idx >= 0) {
                    this.currentPlayerIdx = this.players.indexOf(aliveR[idx]);
                    this.turnCount++;
                    await this.delay(500 / this.aiSpeed);
                    this.startTurn();
                    return;
                }
            }

            const alive = this.getAlivePlayers();
            if (alive.length <= 1) {
                this.endGame();
                return;
            }
            const currentAlive = alive.find(p => p.id === this.players[this.currentPlayerIdx].id);
            if (!currentAlive) {
                this.currentPlayerIdx = alive[0].id;
            } else {
                const idx = alive.indexOf(currentAlive);
                const next = alive[(idx + 1) % alive.length];
                this.currentPlayerIdx = this.players.indexOf(next);
            }
            this.turnCount++;
            if (this.turnCount > 60) {
                this.log('回合数过多(>60)，强制结束', 'danger');
                this.endGame();
                return;
            }
            // 添加延迟让玩家看清回合切换（使用aiSpeed倍率）
            const delayMs = 500 / this.aiSpeed;
            await this.delay(delayMs);
            this.startTurn();
        }

        // ========== 处理玩家动作 ==========
        async processAction(action) {
            const player = this.players[this.currentPlayerIdx];
            if (!player || player.isAI) return;

            switch (action.type) {
                case 'useCard':
                    await this.useCard(player, action.cardId, action.targetIds, action.skillName);
                    break;
                case 'endTurn':
                    // 人类结束出牌阶段 → 进入弃牌阶段
                    if (this.phase === SGS.Config.PHASE.PLAY) {
                        this.phase = SGS.Config.PHASE.DISCARD;
                        this.notifyState();
                        this._setTimer(() => this.doDiscard(player), 100);
                    }
                    break;
                case 'discard':
                    if (this.phase === SGS.Config.PHASE.DISCARD) {
                        this.finishDiscard(player, action.cards);
                    }
                    break;
                case 'useSkill':
                    await this.useSkill(player, action.skillName, action.params);
                    break;
                case 'chooseCard':
                    // 玩家从卡牌选择UI中选中了一张牌
                    if (this._pendingCardChoice) {
                        const chosen = this._pendingCardChoice.cards.find(c => c.instanceId === action.cardId);
                        const resolve = this._pendingCardChoice.resolve;
                        this._pendingCardChoice = null;
                        resolve(chosen || null);
                    }
                    break;
                case 'skipDraw':
                    // 跳过摸牌（如神速等技能）
                    player.alreadyDrew = true;
                    this.phase = SGS.Config.PHASE.PLAY;
                    this.notifyState();
                    this.doPlay(player);
                    break;
                case 'finishLuoshen':
                    // 人类玩家完成洛神
                    if (this._waitingForLuoshen && this._luoshenPlayer && this._luoshenPlayer.id === player.id) {
                        this.finishLuoshen();
                    }
                    break;
                case 'finishGuicai':
                    // 人类玩家完成鬼才
                    if (this._waitingForGuicai && this._guicaiPlayer && this._guicaiPlayer.id === player.id) {
                        this.finishGuicai(player, action.card);
                    }
                    break;
                case 'finishGuidao':
                    // 人类玩家完成鬼道
                    if (this._waitingForGuidao && this._guidaoPlayer && this._guidaoPlayer.id === player.id) {
                        this.finishGuidao(player, action.card);
                    }
                    break;
            }
            this.notifyState();
        }

        // 人类玩家完成洛神
        finishLuoshen() {
            // 防止重复调用
            if (!this._waitingForLuoshen) {
                return;
            }
            const player = this._luoshenPlayer;
            if (!player) return;

            this.log(`${player.name}洛神结束，准备推进到判定阶段`, 'normal');
            this._waitingForLuoshen = false;
            this._luoshenPlayer = null;

            // 直接推进到下一个阶段，不再重新执行 doBegin
            this.advancePhase();
        }

        // 人类玩家完成鬼才
        finishGuicai(player, chosenCard) {
            if (!this._waitingForGuicai || !this._guicaiPlayer) return;

            let finalResult = this._guicaiFinalResult;
            const judgeCard = this._guicaiJudgeCard;
            const currentPlayer = this._guicaiPlayer; // 保存引用，因为后面会清理
            // 先保留原判定牌引用（被替换的牌需入弃牌堆），清理后再读取就已为 null
            const originalResult = this._guicaiOriginalResult;

            if (chosenCard) {
                // 找到并移除选择的牌（从发动鬼才的玩家手中移除）
                const owner = this._guicaiPlayer || currentPlayer;
                const idx = owner.handCards.indexOf(chosenCard);
                if (idx >= 0) {
                    owner.handCards.splice(idx, 1);
                    finalResult = chosenCard;
                    this.log(`${owner.name}发动鬼才，替换了判定牌为${SGS.CardData.suitName[chosenCard.suit]}${SGS.CardData.numberName[chosenCard.number]}`, 'highlight');
                }
            }

            // 清理状态
            this._waitingForGuicai = false;
            this._guicaiPlayer = null;
            this._guicaiJudgeCard = null;
            this._guicaiOriginalResult = null;
            this._guicaiFinalResult = null;

            // 继续判定流程（传入player引用与被替换的原判定牌）
            this._continueJudgeAfterSkill(judgeCard, finalResult, currentPlayer, originalResult);
        }

        // 人类玩家完成鬼道
        finishGuidao(player, chosenCard) {
            if (!this._waitingForGuidao || !this._guidaoPlayer) return;

            let finalResult = this._guidaoFinalResult;
            const judgeCard = this._guidaoJudgeCard;
            const currentPlayer = this._guidaoPlayer; // 保存引用
            // 先保留原判定牌引用（被替换的牌需入弃牌堆），清理后再读取就已为 null
            const originalResult = this._guidaoOriginalResult;

            if (chosenCard && (chosenCard.suit === 'spade' || chosenCard.suit === 'club')) {
                // 找到并移除选择的牌（从发动鬼道的玩家手中移除）
                const owner = this._guidaoPlayer || currentPlayer;
                const idx = owner.handCards.indexOf(chosenCard);
                if (idx >= 0) {
                    owner.handCards.splice(idx, 1);
                    finalResult = chosenCard;
                    this.log(`${owner.name}发动鬼道，替换了判定牌为${SGS.CardData.suitName[chosenCard.suit]}${SGS.CardData.numberName[chosenCard.number]}`, 'highlight');
                }
            }

            // 清理状态
            this._waitingForGuidao = false;
            this._guidaoPlayer = null;
            this._guidaoJudgeCard = null;
            this._guidaoOriginalResult = null;
            this._guidaoFinalResult = null;

            // 继续判定流程（传入player引用与被替换的原判定牌）
            this._continueJudgeAfterSkill(judgeCard, finalResult, currentPlayer, originalResult);
        }

        // 继续判定流程（鬼才/鬼道之后）
        async _continueJudgeAfterSkill(judgeCard, finalResult, currentPlayer, originalResult) {
            const player = currentPlayer; // 使用传入的player引用
            if (!player) return;

            // 将判定结果（被替换后的牌）放入弃牌堆；若被天妒拿入手牌则跳过（由末尾天妒分支处理，避免卡牌重复/守恒破坏）
            if (!(player.skills.some(s => s.name === '天妒'))) {
                this.discardPile.push(finalResult);
            }

            // 如果判定牌被替换（鬼才/鬼道），被替换掉的原判定牌也要放入弃牌堆，避免凭空消失
            if (originalResult && originalResult !== finalResult) {
                this.discardPile.push(originalResult);
            }

            // 根据判定结果执行效果
            switch (judgeCard.subtype) {
                case 'lebusi':
                    if (finalResult.suit !== 'heart') {
                        this.log(`${player.name}被乐不思蜀`, 'danger');
                        player._skipPlay = true;
                    }
                    break;
                case 'bingliang':
                    if (finalResult.suit !== 'club') {
                        this.log(`${player.name}被兵粮寸断`, 'danger');
                        player._skipDraw = true;
                    }
                    break;
                case 'shandian':
                    if (finalResult.suit === 'spade' && finalResult.number >= 2 && finalResult.number <= 9) {
                    this.log(`${player.name}被闪电击中！3点雷伤害`, 'danger');
                    await this.dealDamage(player, 3, { source: null, element: 'thunder', card: judgeCard });
                    this.discardPile.push(judgeCard);
                    } else {
                        const nextPlayer = this.getNextPlayer(player);
                        if (nextPlayer && nextPlayer.isAlive) {
                            this.log(`闪电传给${nextPlayer.name}`, 'normal');
                            nextPlayer.judgmentCards.push(judgeCard);
                        }
                    }
                    break;
            }

            // 非闪电的判定牌（乐不思蜀/兵粮寸断）经鬼才/鬼道结算后需置入弃牌堆
            if (judgeCard.subtype !== 'shandian') {
                this.discardPile.push(judgeCard);
            }

            // 天妒 (郭嘉)：获得判定牌
            if (player.skills.some(s => s.name === '天妒')) {
                player.handCards.push(finalResult);
                this.log(`${player.name}发动天妒，获得了判定牌${finalResult.name}`, 'highlight');
            }

            this.notifyState();

            // 继续处理剩余的判定牌
            if (player.judgmentCards.length > 0) {
                this._setTimer(() => this.doJudge(player), 100);
            } else {
                // 所有判定完成，推进到下一个阶段
                this._setTimer(() => this.advancePhase(), 100);
            }
        }

        // ========== 使用卡牌 ==========
        async useCard(player, cardId, targetIds = [], skillName = null) {
            const card = player.handCards.find(c => c.instanceId === cardId);
            if (!card) return false;

            // 武神技能：红桃手牌视为杀
            const hasWushen = player.skills.some(s => s.name === '武神');
            let actualCard = card;
            if (hasWushen && card.suit === 'heart') {
                // 创建临时卡牌对象（红桃牌当杀用）
                actualCard = { ...card, subtype: 'sha', name: '杀（武神）' };
                this.log(`${player.name}发动【武神】，将红桃牌当【杀】使用`, 'highlight');
            }

            // 检查是否能使用
            if (!this.canUseCard(player, actualCard, targetIds)) {
                return false;
            }

            // 从手牌移除
            const idx = player.handCards.indexOf(card);
            player.handCards.splice(idx, 1);
            if (global.__SGS_TRACE__) console.error('[TRACE] useCard splice', player.name, 'card=', card.instanceId, 'actualCard===card?', actualCard === card, 'actualCard.id=', actualCard.instanceId);

            this.log(`${player.name}使用了${actualCard.name}`, 'highlight');

            // 通知UI层显示出牌动画
            try {
                this.adapter && this.adapter.notifyEvent({
                    type: 'cardUsed',
                    detail: { card: {name:actualCard.name, subtype:actualCard.subtype, element:actualCard.element, type:actualCard.type}, fromId: player.id, targetIds }
                });
            } catch(e) { /* 忽略 */ }

            // 处理卡牌效果
            await this.resolveCard(player, actualCard, targetIds);

            // 集智 (黄月英)：使用非基本牌后摸1张
            if (player.skills.some(s => s.name === '集智') && card &&
                card.subtype !== 'sha' && card.subtype !== 'shan' && card.subtype !== 'tao') {
                this.drawCard(player, 1);
                this.log(`${player.name}发动【集智】，摸了1张牌`, 'highlight');
            }

            return true;
        }

        canUseCard(player, card, targetIds = []) {
            // 无懈可击不能主动使用，只能响应
            if (card.subtype === 'wuxie') return false;
            
            // 武神技能：红桃手牌视为杀
            const hasWushen = player.skills.some(s => s.name === '武神');
            const isWushenSha = hasWushen && (card.suit === 'heart');
            // 天义(太史慈)等技能可提高本回合出【杀】的上限
            const shaLimit = player.shaLimitOverride || 1;
            
            // 检查阶段
            if (this.phase !== SGS.Config.PHASE.PLAY) {
                // 某些卡可在特定阶段外使用（桃救人、无懈可击等）
                if (card.subtype === 'tao' && this.phase === 'dying') return true;
                if (card.subtype === 'wuxie') return true;
                // 武神：红桃牌视为杀，可以在出牌阶段使用
                if (isWushenSha) return true;
                return false;
            }
            // 基本牌检查
            // 武神：红桃牌视为杀
            if (isWushenSha) {
                // 按杀来处理
                if (player.shaUsedThisTurn >= shaLimit) {
                    const hasZhuge = player.equipment.weapon && player.equipment.weapon.subtype === 'zhuge';
                    const hasPaoxiao = player.skills.some(s => s.name === '咆哮');
                    if (!hasZhuge && !hasPaoxiao) return false;
                }
                if (targetIds.length === 0) return false;
                const target = this.players[targetIds[0]];
                if (!target || !target.isAlive) return false;
                // 武神第二效果：使用红桃杀无距离限制
                // 跳过距离检查
                // 空城不能成为杀的目标
                if (target.handCards.length === 0) {
                    const hasKongcheng = target.skills.some(s => s.name === '空城');
                    if (hasKongcheng) return false;
                }
                return true;
            }
            
            switch (card.subtype) {
                case 'sha':
                    // 检查出杀次数（诸葛连弩/咆哮/天义除外）
                    if (player.shaUsedThisTurn >= shaLimit) {
                        const hasZhuge = player.equipment.weapon && player.equipment.weapon.subtype === 'zhuge';
                        const hasPaoxiao = player.skills.some(s => s.name === '咆哮');
                        if (!hasZhuge && !hasPaoxiao) return false;
                    }
                    // 检查目标
                    if (targetIds.length === 0) return false;
                    const target = this.players[targetIds[0]];
                    if (!target || !target.isAlive) return false;
                    // 空城不能成为杀的目标
                    if (target.handCards.length === 0) {
                        const hasKongcheng = target.skills.some(s => s.name === '空城');
                        if (hasKongcheng) return false;
                    }
                    // 距离检查
                    // 武神第二效果：使用红桃杀无距离限制；神力：使用杀无视距离
                    const hasShenli = player.skills.some(s => s.name === '神力');
                    if (!hasShenli && (card.suit !== 'heart' || !hasWushen)) {
                        if (!this.canAttack(player, target)) return false;
                    }
                    break;
                case 'shan':
                    // 闪只能通过响应(requestResponse)打出；主公技(护驾/黄天)在 requestResponse 内处理
                    return false; // 闪只能响应打出
                    break;
                case 'tao':
                    if (player.hp >= player.maxHp) return false;
                    break;
                case 'jiu':
                    if (player.jiuUsedThisTurn) return false;
                    break;
                // === 锦囊目标合法性校验（避免出牌后因引擎内部距离/条件限制而白白浪费） ===
                case 'juedou':
                    if (targetIds.length === 0) return false;
                    const jt = this.players[targetIds[0]];
                    if (!jt || !jt.isAlive) return false;
                    // 空城：不能成为决斗的目标
                    if (jt.handCards.length === 0 && jt.skills.some(s => s.name === '空城')) return false;
                    break;
                case 'guohe': // 过河拆桥
                    if (targetIds.length === 0) return false;
                    const gt = this.players[targetIds[0]];
                    if (!gt || !gt.isAlive) return false;
                    if (gt.skills.some(s => s.name === '谦逊')) return false; // 谦逊：不能被过河拆桥
                    if (gt.skills.some(s => s.name === '帷幕') && (card.suit === 'spade' || card.suit === 'club')) return false; // 帷幕：黑色锦囊无效
                    if (!player.skills.some(s => s.name === '奇才') && this.getDistance(player, gt) > 1) return false;
                    break;
                case 'shunshou': // 顺手牵羊
                    if (targetIds.length === 0) return false;
                    const sst = this.players[targetIds[0]];
                    if (!sst || !sst.isAlive) return false;
                    if (sst.skills.some(s => s.name === '谦逊')) return false;
                    if (sst.skills.some(s => s.name === '帷幕') && (card.suit === 'spade' || card.suit === 'club')) return false;
                    if (!player.skills.some(s => s.name === '奇才') && this.getDistance(player, sst) > 1) return false;
                    break;
                case 'huogong': // 火攻：目标必须有手牌
                    if (targetIds.length === 0) return false;
                    const ht = this.players[targetIds[0]];
                    if (!ht || !ht.isAlive || ht.handCards.length === 0) return false;
                    break;
            }
            return true;
        }

        async resolveCard(player, card, targetIds = []) {
            if (global.__SGS_TRACE__) console.error('[TRACE] resolveCard ENTER', card.instanceId, 'type=', card.type, 'subtype=', card.subtype);
            // 记录对局事件
            this.addMatchEvent('use_card', {
                player: player.name,
                card: card.name,
                cardType: card.type,
                targets: targetIds.map(id => this.players[id]?.name).filter(Boolean)
            });

            // 触发使用卡牌事件
            this.emit('onUseCard', { player, card, targetIds, engine: this });

            // 集智等技能
            if (card.type === 'trick' && card.subtype !== 'wuxie') {
                this.emit('onUseTrick', { player, card, engine: this });
            }

            switch (card.type) {
                case 'basic':
                    await this.resolveBasicCard(player, card, targetIds);
                    break;
                case 'trick':
                    await this.resolveTrickCard(player, card, targetIds);
                    break;
                case 'delay':
                    await this.resolveDelayCard(player, card, targetIds);
                    break;
                case 'equip':
                    this.resolveEquipCard(player, card);
                    break;
            }

            // 弃入弃牌堆（装备和延时锦囊例外）
            if (global.__SGS_TRACE__) console.error('[TRACE] resolveCard after-switch', card.instanceId);
            if (card.type !== 'equip' && card.type !== 'delay') {
                // 若该牌已被某技能（如奸雄）收入某角色的手牌/装备/判定区，
                // 或已被移入弃牌堆/牌堆（例如奸雄将牌放入手牌后，该角色在结算过程中阵亡，
                // 死亡处理将其手牌弃入弃牌堆），则不再入弃牌堆，否则同一对象会被重复入堆，
                // 造成卡牌重复、洗牌后出现重复牌（破坏卡牌守恒）。
                let alreadyAccounted = false;
                if (this.discardPile.indexOf(card) >= 0 || this.deck.indexOf(card) >= 0) {
                    alreadyAccounted = true;
                } else {
                    for (const p of this.players) {
                        if (p.handCards.indexOf(card) >= 0 || p.judgmentCards.indexOf(card) >= 0 ||
                            p.equipment.weapon === card || p.equipment.armor === card ||
                            p.equipment.horsePlus === card || p.equipment.horseMinus === card) {
                            alreadyAccounted = true; break;
                        }
                    }
                }
                if (!alreadyAccounted) { this.discardPile.push(card); if (global.__SGS_TRACE__) console.error('[TRACE] resolveCard push discard', card.instanceId); }
                else { if (global.__SGS_TRACE__) console.error('[TRACE] resolveCard alreadyAccounted, NOT pushed', card.instanceId); }
            }

            this.notifyState();
        }

        // ========== 基本牌 ==========
        async resolveBasicCard(player, card, targetIds) {
            switch (card.subtype) {
                case 'sha':
                    player.shaUsedThisTurn++;
                    const damage = player.drunk ? 2 : 1;
                    player.drunk = false;
                    const target = this.players[targetIds[0]];
                    await this.resolveSha(player, target, card, damage);
                    break;
                case 'tao':
                    this.heal(player, 1);
                    this.log(`${player.name}回复1点体力`, 'success');
                    break;
                case 'jiu':
                    player.jiuUsedThisTurn = true;
                    player.drunk = true;
                    this.log(`${player.name}使用了酒`, 'normal');
                    break;
            }
        }

        async resolveSha(source, target, card, baseDamage = 1, depth = 0) {
            this.log(`${source.name}对${target.name}使用了【杀】`, 'highlight');

            // 享乐 (刘禅)：被杀需弃基本牌
            if (target.skills.some(s => s.name === '享乐') && source.isAlive) {
                const basicCards = source.handCards.filter(c => c.type === 'basic');
                if (basicCards.length > 0) {
                    // 自动弃一张基本牌
                    const discard = basicCards[0];
                    source.handCards.splice(source.handCards.indexOf(discard), 1);
                    this.discardPile.push(discard);
                    this.log(`${source.name}享乐：弃置了${discard.name}`, 'normal');
                } else {
                    this.log(`${source.name}没有基本牌，享乐使【杀】无效！`, 'danger');
                    return;
                }
            }

            // 触发指定目标事件（铁骑、马超等）
            this.emit('onShaTarget', { source, target, card, engine: this });

            // 流离 (大乔): 被杀时转移给攻击范围内角色
            if (depth < 10 && target.skills.some(s => s.name === '流离') && source && source.isAlive) {
                const candidates = this.getAlivePlayers().filter(p =>
                    p.id !== target.id && p.id !== source.id &&
                    this.canAttack(target, p) && this.canAttack(source, p)
                );
                if (candidates.length > 0) {
                    const wantLiuli = await this.askSkillConfirm(target, '流离',
                        '是否发动【流离】将此杀转移给攻击范围内的一名角色？');
                    if (wantLiuli) {
                        const transferTarget = target.isAI
                            ? candidates[Math.floor(Math.random() * candidates.length)]
                            : await this.chooseTarget(target, candidates, '流离：选择转移的目标');
                        if (transferTarget) {
                            this.log(`${target.name}发动流离，将杀转移给${transferTarget.name}`, 'highlight');
                            return await this.resolveSha(source, transferTarget, card, baseDamage, depth + 1);
                        }
                    }
                }
            }

            // 朱雀羽扇：普通杀当作火杀
            let element = card.element;
            if (card.subtype === 'sha' && source.equipment.weapon && source.equipment.weapon.subtype === 'zhuque' && element === 'normal') {
                element = 'fire';
            }
            // 青釭剑：使用杀时无视目标防具
            const ignoreArmor = !!(source.equipment.weapon && source.equipment.weapon.subtype === 'qinggang');

            // 检查是否可被闪避
            let unavoidable = false;
            if (source.skills.some(s => s.name === '铁骑')) {
                const judge = this.revealTopCard();
                if (!judge) {
                    this.log(`${source.name}铁骑：牌堆已空，无法判定`, 'normal');
                } else {
                    this.log(`${source.name}铁骑判定：${SGS.CardData.suitName[judge.suit]}${SGS.CardData.numberName[judge.number]}`, 'normal');
                    if (judge.suit === 'heart' || judge.suit === 'diamond') {
                        unavoidable = true;
                        this.log(`铁骑生效，此杀不可被闪避！`, 'danger');
                    }
                    this.discardPile.push(judge);
                }
            }
            // 烈弓
            if (source.skills.some(s => s.name === '烈弓') && source.handCards.length >= target.handCards.length) {
                unavoidable = true;
                this.log(`烈弓生效，此杀不可被闪避！`, 'danger');
            }

            if (!unavoidable) {
                // 请求闪（青釭剑：无视目标防具）
                const shan = await this.requestResponse(target, 'shan', source, { ignoreArmor });
                if (shan) {
                    this.log(`${target.name}打出了闪`, 'success');
                    // 无双 (吕布)：需要打出两张闪（requestResponse 已负责入弃牌堆）
                    if (source.skills.some(s => s.name === '无双')) {
                        const shan2 = await this.requestResponse(target, 'shan', source, { ignoreArmor });
                        if (shan2) {
                            this.log(`${target.name}无双：打出了第二张闪`, 'success');
                        } else {
                            this.log(`${target.name}无双：未能打出第二张闪，杀命中！`, 'danger');
                            await this._resolveShaHit(source, target, card, baseDamage, element, ignoreArmor);
                            return;
                        }
                    }
                    // 通知UI显示闪避动画
                    try {
                        this.adapter && this.adapter.notifyEvent({ type: 'shan', detail: { playerId: target.id } });
                    } catch(e) {}
                    // 雷击 (张角): 使用或打出闪后，可令一名角色判定
                    if (target.skills.some(s => s.name === '雷击')) {
                        const aliveOthers = this.getAlivePlayers().filter(p => p.id !== target.id);
                        if (aliveOthers.length > 0) {
                            const wantLeiji = await this.askSkillConfirm(target, '雷击',
                                '使用或打出闪后，是否发动【雷击】令一名其他角色进行判定（若为♠则受2点雷伤害）？');
                            if (wantLeiji) {
                                const chosen = target.isAI
                                    ? aliveOthers[Math.floor(Math.random() * aliveOthers.length)]
                                    : await this.chooseTarget(target, aliveOthers, '雷击：选择雷击的目标');
                                if (chosen) {
                                    this.log(`${target.name}发动雷击`, 'highlight');
                                    const judge = this.revealTopCard();
                                    if (!judge) {
                                        this.log(`雷击：牌堆已空，无法判定`, 'normal');
                                    } else {
                                        this.log(`雷击判定：${SGS.CardData.suitName[judge.suit]}${SGS.CardData.numberName[judge.number]}`, 'normal');
                                        if (judge.suit === 'spade') {
                                            await this.dealDamage(chosen, 2, { source: target, element: 'thunder', card: shan });
                                            this.log(`${target.name}雷击成功，${chosen.name}受到2点雷伤害！`, 'danger');
                                        } else {
                                            this.log(`雷击失败，判定不是♠`, 'normal');
                                        }
                                        this.discardPile.push(judge);
                                    }
                                }
                            }
                        }
                    }
                    // 贯石斧：杀被闪抵消时，可弃两张牌强制命中
                    if (source.equipment.weapon && source.equipment.weapon.subtype === 'guanshi' && source.isAlive && target.isAlive && source.handCards.length >= 2) {
                        let useGuanshi = source.isAI ? true : await this.askSkillConfirm(source, '贯石斧', `是否发动【贯石斧】弃两张牌，强制命中${target.name}？`);
                        if (useGuanshi) {
                            const g1 = source.handCards[0];
                            const g2 = source.handCards.find(c => c !== g1) || source.handCards[1];
                            this.discardCard(source, g1);
                            this.discardCard(source, g2);
                            this.log(`${source.name}发动贯石斧，强制命中${target.name}`, 'highlight');
                            await this.dealDamage(target, baseDamage, { source, element, card, ignoreArmor });
                            return;
                        }
                    }
                    // 青龙偃月刀：杀被闪抵消时，可再出一张杀
                    if (source.equipment.weapon && source.equipment.weapon.subtype === 'qinglong' && source.isAlive && target.isAlive) {
                        const ns = source.handCards.find(c => c.subtype === 'sha' && c.instanceId !== card.instanceId);
                        if (ns) {
                            let useQinglong = source.isAI ? true : await this.askSkillConfirm(source, '青龙偃月刀', `是否发动【青龙偃月刀】再对${target.name}出一张杀？`);
                            if (useQinglong) {
                                source.handCards.splice(source.handCards.indexOf(ns), 1);
                                this.log(`${source.name}发动青龙偃月刀，再出一张杀`, 'highlight');
                                await this.resolveSha(source, target, ns, baseDamage, depth + 1);
                                this.discardPile.push(ns);
                                return;
                            }
                        }
                    }
                    // 庞德猛进
                    if (source.skills.some(s => s.name === '猛进') && target.handCards.length > 0) {
                        const discarded = target.handCards[Math.floor(Math.random() * target.handCards.length)];
                        this.discardCard(target, discarded);
                        this.log(`${source.name}发动猛进，弃了${target.name}的${discarded.name}`, 'highlight');
                    }
                    return;
                }
                this.log(`${target.name}没有闪，受到伤害！`, 'danger');
            }

            // 古锭刀/寒冰剑/雌雄双股剑/麒麟弓 等命中后效果统一在此处理
            await this._resolveShaHit(source, target, card, baseDamage, element, ignoreArmor);
        }

        // 杀命中后的武器特效结算（古锭刀/寒冰剑/雌雄双股剑/麒麟弓）
        async _resolveShaHit(source, target, card, baseDamage, element, ignoreArmor) {
            // 古锭刀：使用杀造成伤害时，若目标无手牌，伤害+1
            let dmg = baseDamage;
            if (source.equipment.weapon && source.equipment.weapon.subtype === 'guding' && target.handCards.length === 0) {
                dmg += 1;
                this.log(`${source.name}古锭刀：目标无手牌，伤害+1`, 'highlight');
            }

            // 寒冰剑：可改为弃置目标两张牌（代替伤害）
            if (source.equipment.weapon && source.equipment.weapon.subtype === 'hanbing' && target.isAlive && target.handCards.length >= 2) {
                let useHanbing = source.isAI ? true : await this.askSkillConfirm(source, '寒冰剑', `是否发动【寒冰剑】弃置${target.name}两张手牌代替伤害？`);
                if (useHanbing) {
                    const h1 = target.handCards[0];
                    const h2 = target.handCards.find(c => c !== h1) || target.handCards[1];
                    this.discardCard(target, h1);
                    this.discardCard(target, h2);
                    this.log(`${source.name}发动寒冰剑，弃置了${target.name}的两张牌`, 'highlight');
                    return;
                }
            }

            // 造成伤害
            await this.dealDamage(target, dmg, { source, element, card, ignoreArmor });

            // 雌雄双股剑：命中异性后，令其弃一张手牌或自己摸一张
            if (source.equipment.weapon && source.equipment.weapon.subtype === 'cixiong' && target.isAlive && target.gender !== source.gender) {
                let useCixiong = source.isAI ? true : await this.askSkillConfirm(source, '雌雄双股剑', `是否发动【雌雄双股剑】令${target.name}弃一张手牌或你摸一张牌？`);
                if (useCixiong) {
                    if (target.handCards.length > 0) {
                        const dc = target.handCards[Math.floor(Math.random() * target.handCards.length)];
                        this.discardCard(target, dc);
                        this.log(`${target.name}雌雄双股剑：弃置了${dc.name}`, 'normal');
                    } else {
                        this.drawCard(source, 1);
                        this.log(`${source.name}雌雄双股剑：摸了一张牌`, 'normal');
                    }
                }
            }

            // 麒麟弓：造成伤害后，可弃置目标一匹坐骑
            if (source.equipment.weapon && source.equipment.weapon.subtype === 'qilin' && target.isAlive && (target.equipment.horseMinus || target.equipment.horsePlus)) {
                let useQilin = source.isAI ? true : await this.askSkillConfirm(source, '麒麟弓', `是否发动【麒麟弓】弃置${target.name}一匹坐骑？`);
                if (useQilin) {
                    const slot = target.equipment.horseMinus ? 'horseMinus' : 'horsePlus';
                    const h = target.equipment[slot];
                    if (h) {
                        target.equipment[slot] = null;
                        this.discardPile.push(h);
                        this.emit('onLoseEquip', { player: target, card: h, engine: this });
                        this.log(`${source.name}发动麒麟弓，弃置了${target.name}的${h.name}`, 'highlight');
                    }
                }
            }
        }

        // ========== 锦囊牌 ==========
        // 检查无懈可击
        async checkWuxie(user, card, target) {
            // 按座次顺序询问每位玩家
            const alive = this.getAlivePlayers();
            for (const p of alive) {
                if (!p.isAlive) continue;
                // 不能对自己使用的锦囊打出无懈
                if (p.id === user.id) continue;
                
                // 调用requestResponse检查是否有无懈
                const wuxie = await this.requestResponse(p, 'wuxie', user);
                if (wuxie) {
                    return true;
                }
            }
            return false;
        }

        async resolveTrickCard(player, card, targetIds) {
            // 检查是否被无懈可击
            const targets = targetIds.map(id => this.players[id]).filter(p => p);
            const target = targets[0] || targets[targets.length - 1];
            
            // 询问所有玩家是否打出无懈可击（按座次顺序）
            const canWuxie = await this.checkWuxie(player, card, target);
            if (canWuxie) {
                this.log(`${player.name}的${card.name}被无懈可击抵消！`, 'normal');
                // 该锦囊牌由调用方 resolveCard 统一入弃牌堆（火计路径则由 useSkill 自行入堆），
                // 此处若再 push 会导致同一对象在弃牌堆出现两次，洗牌后牌堆出现重复牌（破坏卡牌守恒）。
                return;
            }
            
            switch (card.subtype) {
                case 'juedou': // 决斗
                    const target = targets[0] || this.getAttackTargets(player)[0];
                    if (!target) return;
                    // 空城不能成为决斗的目标
                    if (target.handCards.length === 0 && target.skills.some(s => s.name === '空城')) {
                        this.log(`${target.name}空城：不能成为决斗的目标！`, 'normal');
                        break;
                    }
                    await this.resolveDuel(player, target, card);
                    break;

                case 'nanman': // 南蛮入侵
                    this.log(`${player.name}使用了南蛮入侵！`, 'highlight');
                    const others = this.getAlivePlayers().filter(p => p.id !== player.id);
                    for (const p of others) {
                        if (!p.isAlive) continue;
                        // 祸首 (孟获)：被【南蛮入侵】造成伤害时，伤害来源视为孟获本人
                        const src = (p.skills.some(s => s.name === '祸首') && player.id !== p.id) ? p : player;
                        const sha = await this.requestResponse(p, 'sha', src);
                        if (!sha) {
                            this.log(`${p.name}受到1点伤害`, 'danger');
                            await this.dealDamage(p, 1, { source: src, card });
                        }
                    }
                    break;

                case 'wanjian': // 万箭齐发
                    this.log(`${player.name}使用了万箭齐发！`, 'highlight');
                    const targets2 = this.getAlivePlayers().filter(p => p.id !== player.id);
                    for (const p of targets2) {
                        if (!p.isAlive) continue;
                        const shan = await this.requestResponse(p, 'shan', player);
                        if (!shan) {
                            await this.dealDamage(p, 1, { source: player, card });
                        }
                    }
                    break;

                case 'taoyuan': // 桃园结义
                    this.log(`${player.name}使用了桃园结义！`, 'highlight');
                    for (const p of this.getAlivePlayers()) {
                        if (p.hp < p.maxHp) {
                            this.heal(p, 1);
                            this.log(`${p.name}回复1点体力`, 'success');
                        }
                    }
                    break;

                case 'wugu': // 五谷丰登
                    // 亮出等同于存活角色数的牌，按行动顺序依次选择
                    const alive = this.getAlivePlayers();
                    const startIdx = alive.indexOf(player);
                    const wuguCards = [];
                    for (let i = 0; i < alive.length; i++) {
                        const c = this.revealTopCard();
                        if (c) wuguCards.push(c);
                    }
                    this.log(`${player.name}使用了五谷丰登，亮出了${wuguCards.length}张牌`, 'highlight');
                    // 按行动顺序依次选择
                    for (let i = 0; i < alive.length; i++) {
                        if (wuguCards.length === 0) break;
                        const p = alive[(startIdx + i) % alive.length];
                        if (p.isAlive) {
                            const chosen = await this.chooseCard(p, wuguCards, `${p.hero.name}选择一张牌获得`);
                            if (chosen) {
                                const idx = wuguCards.indexOf(chosen);
                                if (idx >= 0) wuguCards.splice(idx, 1);
                                p.handCards.push(chosen);
                                this.log(`${p.name}获得了${chosen.name}`, 'success');
                            }
                        }
                    }
                    // 未被任何角色选走的牌必须入弃牌堆，否则凭空消失（洗牌后牌堆会缺牌/重复）
                    for (const c of wuguCards) {
                        this.discardPile.push(c);
                    }
                    break;

                case 'guohe': // 过河拆桥
                    const t1 = targets[0];
                    // 谦逊 (陆逊): 不能被顺手/过河
                    if (t1.skills.some(s => s.name === '谦逊')) {
                        this.log(`${t1.name}谦逊：不能被过河拆桥`, 'normal');
                        break;
                    }
                    // 帷幕 (贾诩): 不能成为黑色锦囊的目标
                    if (t1.skills.some(s => s.name === '帷幕') && (card.suit === 'spade' || card.suit === 'club')) {
                        this.log(`${t1.name}帷幕：不能被黑色锦囊选中`, 'normal');
                        break;
                    }
                    // 奇才 (黄月英)：使用锦囊无距离限制
                    const hasQicai2 = player.skills.some(s => s.name === '奇才');
                    if (!t1 || (!hasQicai2 && this.getDistance(player, t1) > 1)) break;
                    // 获取目标的所有牌（手牌+装备+判定区）
                    const ghCards = [...t1.handCards];
                    const ghIsHand = t1.handCards.map(() => true);
                    const ghIsJudgment = t1.handCards.map(() => false);
                    for (const slot of ['weapon', 'armor', 'horsePlus', 'horseMinus']) {
                        if (t1.equipment[slot]) { ghCards.push(t1.equipment[slot]); ghIsHand.push(false); ghIsJudgment.push(false); }
                    }
                    // 判定区的延时锦囊（乐不思蜀、兵粮寸进、闪电）
                    for (const jc of t1.judgmentCards) {
                        ghCards.push(jc); ghIsHand.push(false); ghIsJudgment.push(true);
                    }
                    if (ghCards.length > 0) {
                        // 如果包含手牌则需要隐藏信息
                        const hideInfo = ghCards.some((c, i) => ghIsHand[i]);
                        const chosen = await this.chooseCard(player, ghCards, `拆除${t1.hero.name}的一张牌`, hideInfo);
                        if (chosen) {
                            // 从目标处移除
                            const hIdx = t1.handCards.indexOf(chosen);
                            if (hIdx >= 0) {
                                t1.handCards.splice(hIdx, 1);
                                this.discardPile.push(chosen);
                            } else if (t1.judgmentCards.some(jc => jc.instanceId === chosen.instanceId)) {
                                // 从判定区移除
                                const jIdx = t1.judgmentCards.indexOf(chosen);
                                if (jIdx >= 0) {
                                    t1.judgmentCards.splice(jIdx, 1);
                                    this.discardPile.push(chosen);
                                    this.log(`${player.name}拆了${t1.name}判定区的${chosen.name}`, 'highlight');
                                }
                            } else {
                                for (const slot of ['weapon', 'armor', 'horsePlus', 'horseMinus']) {
                                    if (t1.equipment[slot] && t1.equipment[slot].instanceId === chosen.instanceId) {
                                        t1.equipment[slot] = null;
                                        this.discardPile.push(chosen);
                                        this.emit('onLoseEquip', { player: t1, card: chosen, engine: this });
                                        break;
                                    }
                                }
                            }
                            this.log(`${player.name}拆了${t1.name}的${chosen.name}`, 'highlight');
                        }
                    }
                    break;

                case 'shunshou': // 顺手牵羊
                    const t2 = targets[0];
                    // 谦逊 (陆逊): 不能被顺手/过河
                    if (t2.skills.some(s => s.name === '谦逊')) {
                        this.log(`${t2.name}谦逊：不能被顺手牵羊`, 'normal');
                        break;
                    }
                    // 帷幕 (贾诩): 不能成为黑色锦囊的目标
                    if (t2.skills.some(s => s.name === '帷幕') && (card.suit === 'spade' || card.suit === 'club')) {
                        this.log(`${t2.name}帷幕：不能被黑色锦囊选中`, 'normal');
                        break;
                    }
                    // 奇才 (黄月英)：使用锦囊无距离限制
                    const hasQicai = player.skills.some(s => s.name === '奇才');
                    if (t2 && (hasQicai || this.getDistance(player, t2) <= 1)) {
                        // 获取目标的所有牌（手牌+装备）
                        const ssCards = [...t2.handCards];
                        const ssIsHand = t2.handCards.map(() => true);
                        for (const slot of ['weapon', 'armor', 'horsePlus', 'horseMinus']) {
                            if (t2.equipment[slot]) { ssCards.push(t2.equipment[slot]); ssIsHand.push(false); }
                        }
                        if (ssCards.length > 0) {
                            // 如果包含手牌则需要隐藏信息
                            const hideInfo = ssCards.some((c, i) => ssIsHand[i]);
                            const chosen = await this.chooseCard(player, ssCards, `从${t2.hero.name}选择一张牌获得`, hideInfo);
                            if (chosen) {
                                // 从目标处移除，加入自己手牌
                                const hIdx = t2.handCards.indexOf(chosen);
                                if (hIdx >= 0) {
                                    t2.handCards.splice(hIdx, 1);
                                } else {
                                    for (const slot of ['weapon', 'armor', 'horsePlus', 'horseMinus']) {
                                        if (t2.equipment[slot] && t2.equipment[slot].instanceId === chosen.instanceId) {
                                            t2.equipment[slot] = null;
                                            this.emit('onLoseEquip', { player: t2, card: chosen, engine: this });
                                            break;
                                        }
                                    }
                                }
                                player.handCards.push(chosen);
                                this.log(`${player.name}从${t2.name}顺走了${chosen.name}`, 'highlight');
                            }
                        }
                    }
                    break;

                case 'wuzhong': // 无中生有
                    this.drawCard(player, 2);
                    this.log(`${player.name}无中生有，摸了2张牌`, 'highlight');
                    break;

                case 'huogong': // 火攻
                    const t3 = targets[0];
                    if (t3 && t3.handCards.length > 0) {
                        // 第一步：目标随机展示一张手牌
                        const showIdx = Math.floor(Math.random() * t3.handCards.length);
                        const showCard = t3.handCards[showIdx];
                        this.log(`${t3.name}展示了${SGS.CardData.suitName[showCard.suit]}${SGS.CardData.numberName[showCard.number]}`, 'normal');

                        // 第二步：使用者选择是否弃置一张同花色牌
                        const sameSuit = player.handCards.filter(c => c.suit === showCard.suit);
                        if (sameSuit.length > 0) {
                            // 让玩家从同花色牌中选择一张弃置
                            const chosen = await this.chooseCard(player, sameSuit, `弃置一张${SGS.CardData.suitName[showCard.suit]}牌进行火攻`);
                            if (chosen) {
                                player.handCards.splice(player.handCards.indexOf(chosen), 1);
                                this.discardPile.push(chosen);
                                this.log(`${player.name}弃了${chosen.name}(${SGS.CardData.suitName[chosen.suit]})，火攻成功！`, 'danger');
                                await this.dealDamage(t3, 1, { source: player, element: 'fire', card });
                            }
                        } else {
                            this.log(`${player.name}没有${SGS.CardData.suitName[showCard.suit]}花色的牌，火攻失败`, 'normal');
                        }
                    }
                    break;

                case 'tiesuo': // 铁索连环
                    if (targets.length === 0) {
                        // 重铸：铁索连环弃置后重摸一张。该牌统一由 resolveCard 在结算末尾入弃牌堆，
                        // 此处若再入弃牌堆会导致同一张牌入两次（洗牌后出现重复牌），故不再重复处理。
                        this.drawCard(player, 1);
                        this.log(`${player.name}重铸了铁索连环`, 'normal');
                    } else {
                        for (const t of targets) {
                            t.isChained = !t.isChained;
                            this.log(`${t.name}${t.isChained ? '被' : '解除'}横置`, 'normal');
                        }
                    }
                    break;

                case 'jiedao': // 借刀杀人
                    const t4 = targets[0];
                    if (t4 && t4.equipment.weapon) {
                        const attackTargets = this.getAttackTargets(t4);
                        if (attackTargets.length > 0) {
                            const sha = await this.requestResponse(t4, 'sha', player);
                            if (sha) {
                                // 正确：t4选择攻击范围内的一名角色出杀（requestResponse 已负责入弃牌堆）
                                let targetForT4 = attackTargets[0];
                                if (t4.isAI && this.ai) {
                                    // AI选择最优目标
                                    for (const at of attackTargets) {
                                        if (at.identity === 'rebel' || at.identity === 'spy') {
                                            targetForT4 = at; break;
                                        }
                                    }
                                }
                                await this.resolveSha(t4, targetForT4, sha, 1);
                            } else {
                                // 不出杀，交出武器
                                const w = t4.equipment.weapon;
                                t4.equipment.weapon = null;
                                player.handCards.push(w);
                                this.emit('onLoseEquip', { player: t4, card: w, engine: this });
                                this.log(`${t4.name}交出了武器${w.name}给${player.name}`, 'highlight');
                            }
                        } else {
                            // 没有可攻击的目标，直接交出武器
                            const w = t4.equipment.weapon;
                            t4.equipment.weapon = null;
                            player.handCards.push(w);
                            this.emit('onLoseEquip', { player: t4, card: w, engine: this });
                            this.log(`${t4.name}没有可攻击的目标，交出了武器${w.name}`, 'highlight');
                        }
                    }
                    break;

                case 'wuxie': // 无懈可击
                    // 无懈逻辑在锦囊结算时处理；此处确保该牌进入弃牌堆
                    this.discardPile.push(card);
                    break;
            }
        }

        async resolveDuel(source, target, card) {
            this.log(`${source.name}对${target.name}使用了决斗！`, 'highlight');
            // 无双：吕布参与的决斗，双方每轮需各出两张【杀】
            const wushuang = source.skills.some(s => s.name === '无双') || target.skills.some(s => s.name === '无双');
            let current = target; // 目标先出杀
            let other = source;
            while (true) {
                const sha = await this.requestResponse(current, 'sha', other);
                if (!sha) {
                    this.log(`${current.name}决斗失败，受到1点伤害`, 'danger');
                    await this.dealDamage(current, 1, { source: other, card });
                    break;
                }
                // 无双：需再出一张【杀】（requestResponse 已负责入弃牌堆）
                if (wushuang) {
                    const sha2 = await this.requestResponse(current, 'sha', other);
                    if (!sha2) {
                        this.log(`${current.name}因无双需出两张杀，决斗失败，受到1点伤害`, 'danger');
                        await this.dealDamage(current, 1, { source: other, card });
                        break;
                    }
                }
                [current, other] = [other, current];
            }
        }

        // ========== 延时锦囊 ==========
        async resolveDelayCard(player, card, targetIds) {
            const target = targetIds.length > 0 ? this.players[targetIds[0]] : player;
            // 检查目标判定区是否已有同名锦囊
            const hasSame = target.judgmentCards.some(c => c.subtype === card.subtype);
            if (!hasSame) {
                target.judgmentCards.push(card);
                this.log(`${player.name}对${target.name}使用了${card.name}`, 'highlight');
            } else {
                this.discardPile.push(card);
                this.log(`${target.name}判定区已有${card.name}，使用失败`, 'normal');
            }
        }

        // ========== 装备牌 ==========
        resolveEquipCard(player, card) {
            const slot = card.slot;
            // 弃掉旧装备
            if (player.equipment[slot]) {
                this.discardPile.push(player.equipment[slot]);
                this.emit('onLoseEquip', { player, card: player.equipment[slot], engine: this });
                // 枭姬 (孙尚香)：失去装备时摸2张
                if (player.skills.some(s => s.name === '枭姬')) {
                    this.drawCard(player, 2);
                    this.log(`${player.name}发动【枭姬】，摸了2张牌`, 'highlight');
                }
            }
            player.equipment[slot] = card;
            this.log(`${player.name}装备了${card.name}`, 'normal');
        }

        // ========== 响应请求（请求打出闪/杀等）==========
        async requestResponse(player, cardType, source, opts = {}) {
            const ignoreArmor = !!opts.ignoreArmor;
            // 无懈可击响应
            if (cardType === 'wuxie') {
                const wuxieCard = player.handCards.find(c => c.subtype === 'wuxie');
                if (!wuxieCard) return null;
                
                if (player.isAI && this.ai) {
                    const shouldUse = this.ai.shouldRespond(player, 'wuxie', source, this);
                    if (shouldUse) {
                        this.discardCard(player, wuxieCard);
                        this.log(`${player.name}打出了无懈可击`, 'highlight');
                        return wuxieCard;
                    }
                    return null;
                }
                // 人类玩家：弹出确认，由玩家决定是否发动无懈可击。
                // 改为确认而非自动打出：此前会自动抵消一切锦囊（含桃园结义/五谷丰登等己方有益锦囊），属逻辑错误。
                // 注意：requestResponse 的签名仅有 (player, cardType, source, opts)，没有 card 形参，
                // 故此处只能引用 source.name，不能引用 card.name（否则 ReferenceError 崩溃）。
                const use = await this.askSkillConfirm(player, '无懈可击',
                    `是否使用【无懈可击】抵消${source ? source.name : '一名角色'}使用的锦囊？`);
                if (use) {
                    this.discardCard(player, wuxieCard);
                    this.log(`${player.name}打出了无懈可击`, 'highlight');
                    return wuxieCard;
                }
                return null;
            }
            
            if (!player.isAlive) return null;

            // 主公技：激将(蜀 需杀)/护驾(魏 需闪)/黄天(群 需闪) —— AI 同势力助手代主公打出
            // 仅当主公自身没有对应的牌时才请助手代打（主公优先用自己的）
            if (cardType === 'sha' && player.isLord && player.faction === 'shu' && player.skills.some(s => s.name === '激将') && !player.handCards.some(c => c.subtype === 'sha')) {
                const c = this._provideLordCard(player, 'shu', 'sha');
                if (c) return c;
            }
            if (cardType === 'shan' && player.isLord && player.faction === 'wei' && player.skills.some(s => s.name === '护驾') && !player.handCards.some(c => c.subtype === 'shan')) {
                const c = this._provideLordCard(player, 'wei', 'shan');
                if (c) return c;
            }
            if (cardType === 'shan' && player.isLord && player.faction === 'qun' && player.skills.some(s => s.name === '黄天') && !player.handCards.some(c => c.subtype === 'shan')) {
                const c = this._provideLordCard(player, 'qun', 'shan');
                if (c) return c;
            }

            // 红颜 (小乔): 黑桃当红桃
            if (player.skills.some(s => s.name === '红颜')) {
                // 在手牌检查时，黑桃视为红桃（简化：在canUseCard中处理）
            }

            // 八阵 (卧龙): 锁定技，无防具时视为装备八卦阵
            if (!ignoreArmor && cardType === 'shan' && player.skills.some(s => s.name === '八阵') && !player.equipment.armor) {
                const judge = this.revealTopCard();
                if (!judge) {
                    this.log(`${player.name}八阵：牌堆已空，无法判定`, 'normal');
                } else {
                    this.log(`${player.name}八阵判定：${SGS.CardData.suitName[judge.suit]}`, 'normal');
                    this.emit('onJudge', { player, judgeCard: null, judgeResult: judge, engine: this });
                    if (judge.suit === 'heart' || judge.suit === 'diamond') {
                        this.log(`八阵生效，视为打出闪！`, 'success');
                        this.discardPile.push(judge);
                        return { name: '闪(八阵)', subtype: 'shan', suit: judge.suit, number: judge.number };
                    }
                    this.discardPile.push(judge);
                }
            }

            // 检查防具（青釭剑：无视防具）
            if (player.equipment.armor && !ignoreArmor) {
                switch (player.equipment.armor.subtype) {
                    case 'bagua':
                        if (cardType === 'shan') {
                            const judge = this.revealTopCard();
                            if (!judge) {
                                this.log(`${player.name}八卦阵：牌堆已空，无法判定`, 'normal');
                            } else {
                                this.log(`${player.name}八卦阵判定：${SGS.CardData.suitName[judge.suit]}`, 'normal');
                                this.emit('onJudge', { player, judgeCard: null, judgeResult: judge, engine: this });
                                if (judge.suit === 'heart' || judge.suit === 'diamond') {
                                    this.log(`八卦阵生效，视为打出闪！`, 'success');
                                    this.discardPile.push(judge);
                                    return { name: '闪(八卦阵)', subtype: 'shan', suit: judge.suit, number: judge.number };
                                }
                                this.discardPile.push(judge);
                            }
                        }
                        break;
                    case 'tengjia':
                        if (cardType === 'shan') {
                            // 藤甲只防普通杀，不防火杀
                            // 此逻辑在dealDamage中处理
                        }
                        break;
                    case 'renwang':
                        // 仁王盾防黑杀
                        if (cardType === 'shan' && source) {
                            // 在dealDamage中处理
                        }
                        break;
                }
            }

            // 倾国 (甄姬) - 主动技，人类弹窗询问是否发动
            if (cardType === 'shan' && player.skills.some(s => s.name === '倾国')) {
                const blackCards = player.handCards.filter(c => c.suit === 'spade' || c.suit === 'club');
                if (blackCards.length > 0) {
                    if (player.isAI) {
                        // AI自动决定是否发动倾国
                        const shouldUse = this.ai && this.ai.shouldRespond && this.ai.shouldRespond(player, 'shan', source, this);
                        if (shouldUse) {
                            const blackCard = blackCards[Math.floor(Math.random() * blackCards.length)];
                            this.discardCard(player, blackCard);
                            this.log(`${player.name}发动倾国，将黑色牌当闪`, 'success');
                            return blackCard;
                        }
                    } else {
                        const want = await this.askSkillConfirm(player, '倾国', '是否发动【倾国】将一张黑色手牌当闪打出？');
                        if (want) {
                            const blackCard = blackCards.length === 1 ? blackCards[0] :
                                await this.chooseCard(player, blackCards, '倾国：选择当闪的黑色牌');
                            if (blackCard) {
                                this.discardCard(player, blackCard);
                                this.log(`${player.name}发动倾国，将黑色牌当闪`, 'success');
                                return blackCard;
                            }
                        }
                    }
                }
            }
            // 龙胆
            if (cardType === 'shan' && player.skills.some(s => s.name === '龙胆')) {
                const sha = player.handCards.find(c => c.subtype === 'sha');
                if (sha) {
                    this.discardCard(player, sha);
                    this.log(`${player.name}发动龙胆，将杀当闪`, 'success');
                    return sha;
                }
            }
            // 武神 (神关羽)：锁定技，红桃牌视为杀，可被动打出
            if (cardType === 'sha' && player.skills.some(s => s.name === '武神')) {
                const hongtao = player.handCards.find(c => c.suit === 'heart');
                if (hongtao) {
                    this.discardCard(player, hongtao);
                    this.log(`${player.name}发动武神，将红桃牌当杀打出`, 'success');
                    return hongtao;
                }
            }
            // 武圣
            if (cardType === 'sha' && player.skills.some(s => s.name === '武圣')) {
                const redCard = player.handCards.find(c => c.suit === 'heart' || c.suit === 'diamond');
                if (redCard) {
                    this.discardCard(player, redCard);
                    this.log(`${player.name}发动武圣，将红色牌当杀`, 'success');
                    return redCard;
                }
            }
            // 龙胆：将【闪】当【杀】打出（应对南蛮入侵/决斗/借刀杀人等需出杀的场景）
            if (cardType === 'sha' && player.skills.some(s => s.name === '龙胆')) {
                const shan = player.handCards.find(c => c.subtype === 'shan');
                if (shan) {
                    this.discardCard(player, shan);
                    this.log(`${player.name}发动龙胆，将闪当杀`, 'success');
                    return shan;
                }
            }
            // 急救
            if (cardType === 'tao' && player.skills.some(s => s.name === '急救')) {
                const redCard = player.handCards.find(c => c.suit === 'heart' || c.suit === 'diamond');
                if (redCard) {
                    this.discardCard(player, redCard);
                    this.log(`${player.name}发动急救，将红色牌当桃`, 'success');
                    return redCard;
                }
            }

            // 寻找手牌中的对应牌
            const card = player.handCards.find(c => c.subtype === cardType);
            if (card) {
                if (player.isAI && this.ai) {
                    const shouldUse = this.ai.shouldRespond(player, cardType, source, this);
                    if (shouldUse) {
                        this.discardCard(player, card);
                        return card;
                    }
                    return null;
                }
                // 人类玩家：技能转化（倾国/龙胆/武圣/急救）的弹窗已在上方询问过，
                // 若玩家未发动技能转化，则自动打出对应的手牌（闪/杀/桃）。
                this.discardCard(player, card);
                return card;
            }

            // 无闪/杀时，检查技能转化
            return null;
        }

        // 主公技辅助：让同势力 AI 助手代主公打出一张【杀】或【闪】
        // 返回该牌（由调用方负责入弃牌堆）；若无可用的 AI 助手则返回 null。
        _provideLordCard(lord, faction, cardType) {
            try {
                const helpers = this.getAlivePlayers().filter(
                    p => p.id !== lord.id && p.faction === faction && p.handCards.some(c => c.subtype === cardType)
                );
                for (const h of helpers) {
                    if (h.isAI && this.ai && typeof this.ai.shouldSaveLord === 'function' && this.ai.shouldSaveLord(h, lord, this)) {
                        const c = h.handCards.find(x => x.subtype === cardType);
                        if (c) {
                            const idx = h.handCards.indexOf(c);
                            if (idx >= 0) h.handCards.splice(idx, 1);
                            const label = faction === 'shu' ? '激将' : faction === 'wei' ? '护驾' : '黄天';
                            this.log(`${h.name}${label}：为${lord.name}打出${cardType === 'sha' ? '杀' : '闪'}`, 'success');
                            this.discardPile.push(c);
                            return c;
                        }
                    }
                }
            } catch (e) { console.error('_provideLordCard:', e); }
            return null;
        }

        // ========== 伤害系统 ==========
        async dealDamage(player, damage, opts = {}) {
            if (!player.isAlive) return;
            const { source = null, element = 'normal', card = null, chainProcessed = null, ignoreArmor = false } = opts;
            if (chainProcessed) chainProcessed.add(player.id);

            // 藤甲：免疫普通杀
            if (!ignoreArmor && player.equipment.armor && player.equipment.armor.subtype === 'tengjia') {
                if (element === 'normal') {
                    this.log(`${player.name}的藤甲抵挡了普通伤害！`, 'success');
                    return;
                }
                if (element === 'fire') {
                    damage += 1;
                    this.log(`藤甲受到火焰伤害+1！`, 'danger');
                }
            }
            // 白银狮子：每回合最多1点
            if (!ignoreArmor && player.equipment.armor && player.equipment.armor.subtype === 'baiyin') {
                if (damage > 1) {
                    damage = 1;
                    this.log(`白银狮子减少伤害至1！`, 'success');
                }
            }
            // 仁王盾：免疫黑杀
            if (!ignoreArmor && player.equipment.armor && player.equipment.armor.subtype === 'renwang') {
                if (card && card.subtype === 'sha' && (card.suit === 'spade' || card.suit === 'club')) {
                    this.log(`${player.name}的仁王盾抵挡了黑色杀！`, 'success');
                    return;
                }
            }
            // 肉林：对异性伤害+1
            if (source && source.skills.some(s => s.name === '肉林') && source.gender !== player.gender) {
                damage += 1;
            }
            // 暴凌 (董卓 主公技): 其他群势力角色对董卓造成伤害+1
            if (source && player.skills.some(s => s.name === '暴凌') && source.faction === 'qun') {
                damage += 1;
                this.log(`暴凌：群势力对${player.name}伤害+1`, 'danger');
            }
            // 激昂：红杀伤害+1
            if (source && source.skills.some(s => s.name === '激昂') && card && card.subtype === 'sha' &&
                (card.suit === 'heart' || card.suit === 'diamond')) {
                damage += 1;
            }
            // 裸衣 (许褚): 裸衣标记下杀和决斗伤害+1
            if (source && source.luoyiActive && card && (card.subtype === 'sha' || card.subtype === 'juedou')) {
                damage += 1;
                this.log(`${source.name}裸衣加成，伤害+1`, 'highlight');
            }
            // 狂暴 (神吕布 锁定技): 使用【杀】或【决斗】造成的伤害 + "狂暴"标记数
            if (source && source.skills.some(s => s.name === '狂暴') &&
                card && (card.subtype === 'sha' || card.subtype === 'juedou')) {
                const marks = source.tokens['狂暴'] || 0;
                if (marks > 0) {
                    damage += marks;
                    this.log(`${source.name}的【狂暴】生效，伤害额外+${marks}`, 'highlight');
                }
            }

            // 天香 (小乔) — 主动技，人类弹窗询问是否发动
            if (player.skills.some(s => s.name === '天香') && source && source.isAlive) {
                // 红颜 (小乔): 黑桃牌视为红桃，可用于天香
                const hasHongyan = player.skills.some(s => s.name === '红颜');
                const heartCards = player.handCards.filter(c => c.suit === 'heart' || (hasHongyan && c.suit === 'spade'));
                // 天香转移链：记录已参与本次转移链的角色，避免两个天香角色互相转移造成无限循环
                const tianxiangChain = opts.tianxiangChain || new Set();
                tianxiangChain.add(player.id);
                const otherTargets = this.getAlivePlayers().filter(p => p.id !== player.id && !tianxiangChain.has(p.id));
                if (heartCards.length > 0 && otherTargets.length > 0) {
                    const wantTianxiang = await this.askSkillConfirm(player, '天香',
                        '受到伤害，是否发动【天香】弃置一张红桃牌，将伤害转移给另一名角色并令其摸一张牌？');
                    if (wantTianxiang) {
                        const chosen = player.isAI
                            ? heartCards[Math.floor(Math.random() * heartCards.length)]
                            : await this.chooseCard(player, heartCards, '天香：选择弃置的红桃牌');
                        if (chosen) {
                            player.handCards.splice(player.handCards.indexOf(chosen), 1);
                            this.discardPile.push(chosen);
                            const target = player.isAI
                                ? otherTargets[Math.floor(Math.random() * otherTargets.length)]
                                : await this.chooseTarget(player, otherTargets, '天香：选择伤害转移的目标');
                            if (target) {
                                this.log(`${player.name}发动天香，将伤害转移给${target.name}`, 'highlight');
                                await this.dealDamage(target, damage, { source: player, element, card, chainProcessed: opts.chainProcessed || null, tianxiangChain });
                                this.drawCard(target, 1);
                                return;
                            }
                        }
                    }
                }
            }

            // 狂暴 (神吕布 锁定技): 每受到1点伤害获得1枚"狂暴"标记
            if (damage > 0 && player.skills.some(s => s.name === '狂暴')) {
                player.tokens['狂暴'] = (player.tokens['狂暴'] || 0) + damage;
                this.log(`${player.name}获得${damage}枚【狂暴】标记（共${player.tokens['狂暴']}枚）`, 'highlight');
            }

            player.hp -= damage;
            this.log(`${player.name}受到${damage}点${element === 'fire' ? '火焰' : element === 'thunder' ? '雷电' : ''}伤害（剩余${player.hp}体力）`, 'danger');

            // 放逐 (曹丕): 受到伤害后，可令一名角色翻面并摸X张牌(X为伤害值)
            if (player.skills.some(s => s.name === '放逐') && player.isAlive) {
                try {
                    const fzTargets = this.getAlivePlayers().filter(p => p.id !== player.id);
                    if (fzTargets.length > 0) {
                        const wantFangqu = player.isAI
                            ? true
                            : await this.askSkillConfirm(player, '放逐', `受到伤害，是否发动【放逐】令一名角色翻面并摸${damage}张牌？`);
                        if (wantFangqu) {
                            const fzTarget = player.isAI
                                ? fzTargets[Math.floor(Math.random() * fzTargets.length)]
                                : await this.chooseTarget(player, fzTargets, `放逐：选择要翻面的角色`);
                            if (fzTarget) {
                                fzTarget.isFlipped = true;
                                this.drawCard(fzTarget, damage);
                                this.log(`${player.name}发动【放逐】，令${fzTarget.name}翻面并摸${damage}张牌`, 'highlight');
                            }
                        }
                    }
                } catch (e) { console.error('放逐:', e); }
            }

            // 通知UI显示伤害动画
            try {
                this.adapter && this.adapter.notifyEvent({
                    type: 'damage', detail: { playerId: player.id, damage, element, sourceId: source ? source.id : null }
                });
            } catch(e) {}

            // 铁索连环传导
            if (player.isChained && (element === 'fire' || element === 'thunder')) {
                await this.propagateChain(player, damage, element, source);
                player.isChained = false;
            }

            // 触发受伤事件
            this.emit('onDamaged', { player, damage, source, element, card, engine: this });

            // 技能触发：受到伤害后
            // 奸雄 (曹操) — LOCKED，自动发动
            if (player.skills.some(s => s.name === '奸雄') && card && source) {
                player.handCards.push(card);
                this.log(`${player.name}发动奸雄，获得了${card.name}`, 'highlight');
                try { this.adapter && this.adapter.notifyEvent({ type: 'skill', skillName: '奸雄', playerId: player.id }); } catch(e){}
            }
            // 反馈 (司马懿) — 被动技，人类选择获得哪张牌
            if (player.skills.some(s => s.name === '反馈') && source && source.isAlive) {
                const sourceCards = [...source.handCards];
                for (const slot of ['weapon', 'armor', 'horsePlus', 'horseMinus']) {
                    if (source.equipment[slot]) sourceCards.push(source.equipment[slot]);
                }
                if (sourceCards.length > 0) {
                    const chosen = source.isAI
                        ? sourceCards[Math.floor(Math.random() * sourceCards.length)]
                        : await this.chooseCard(source, sourceCards, '反馈：选择获得来源的一张牌');
                    if (chosen) {
                        const hIdx = source.handCards.indexOf(chosen);
                        if (hIdx >= 0) {
                            source.handCards.splice(hIdx, 1);
                        } else {
                            for (const slot of ['weapon', 'armor', 'horsePlus', 'horseMinus']) {
                                if (source.equipment[slot] && source.equipment[slot].instanceId === chosen.instanceId) {
                                    source.equipment[slot] = null;
                                    break;
                                }
                            }
                        }
                        player.handCards.push(chosen);
                        this.log(`${player.name}发动反馈，获得了${source.name}的${chosen.name}`, 'highlight');
                    }
                }
            }
            // 刚烈 (夏侯惇) — 被动技，强制判定，人类选择弃置的牌
            if (player.skills.some(s => s.name === '刚烈') && source && source.isAlive) {
                const judge = this.revealTopCard();
                this._showAnim('judgeDraw', { player, card: judge });
                if (!judge) {
                    this.log(`${player.name}刚烈：牌堆已空，无法判定`, 'normal');
                } else {
                this.log(`${player.name}刚烈判定：${SGS.CardData.suitName[judge.suit]}${SGS.CardData.numberName[judge.number]}`, 'normal');
                if (judge.suit !== 'heart') {
                    const sourceCards = [...source.handCards];
                    for (const slot of ['weapon', 'armor', 'horsePlus', 'horseMinus']) {
                        if (source.equipment[slot]) sourceCards.push(source.equipment[slot]);
                    }
                    if (sourceCards.length >= 2) {
                        const toDiscard = [];
                        if (source.isAI) {
                            while (toDiscard.length < 2 && sourceCards.length > 0) {
                                const idx = Math.floor(Math.random() * sourceCards.length);
                                toDiscard.push(sourceCards.splice(idx, 1)[0]);
                            }
                        } else {
                            let remaining = [...sourceCards];
                            for (let i = 0; i < 2 && remaining.length > 0; i++) {
                                const c = await this.chooseCard(source, remaining, `刚烈：选择弃置的第${i + 1}张牌`);
                                if (!c) break;
                                toDiscard.push(c);
                                remaining = remaining.filter(x => x.instanceId !== c.instanceId);
                            }
                        }
                        for (const c of toDiscard) {
                            this.discardCard(source, c);
                        }
                        if (toDiscard.length > 0) this.log(`${source.name}受到刚烈影响，弃置了${toDiscard.length}张牌`, 'normal');
                    } else {
                        await this.dealDamage(source, 1, { source: player });
                        this.log(`${source.name}受到刚烈造成的1点伤害`, 'danger');
                    }
                } else {
                    this.log(`刚烈失败，判定为♥`, 'normal');
                }
                this.discardPile.push(judge);
                }
            }
            // 遗计 (郭嘉) — 被动技(可)，人类弹窗询问是否发动
            if (player.skills.some(s => s.name === '遗计')) {
                const wantYiji = await this.askSkillConfirm(player, '遗计',
                    '受到伤害，是否发动【遗计】摸2张牌并交给任意角色（含自己）？');
                if (wantYiji) {
                    for (let i = 0; i < damage; i++) {
                        this.drawCard(player, 2);
                        this.log(`${player.name}发动遗计，摸了2张牌`, 'highlight');
                        const y = Math.max(0, player.hp);
                        if (y > 0 && player.handCards.length > 0) {
                            // 遗计：任意角色（含自己）都可成为目标
                            const aliveOthers = this.getAlivePlayers();
                            const giveCount = Math.min(y, player.handCards.length);
                            for (let j = 0; j < giveCount; j++) {
                                if (aliveOthers.length === 0 || player.handCards.length === 0) break;
                                const target = player.isAI
                                    ? aliveOthers[Math.floor(Math.random() * aliveOthers.length)]
                                    : await this.chooseTarget(player, aliveOthers, '遗计：选择交给牌的角色');
                                if (target) {
                                    const cardToGive = player.handCards.pop();
                                    target.handCards.push(cardToGive);
                                    this.log(`${player.name}将${cardToGive.name}交给了${target.name}`, 'normal');
                                }
                            }
                        }
                    }
                }
            }
            // 武魂 (神关羽) — LOCKED，自动累加梦魇
            if (player.skills.some(s => s.name === '武魂')) {
                player.tokens = player.tokens || {};
                player.tokens['梦魇'] = (player.tokens['梦魇'] || 0) + damage;
                this.log(`${player.name}获得${damage}个梦魇标记`, 'normal');
            }
            // 节命 (荀彧) — 被动技(可)，受伤后令一名角色补牌至体力上限
            if (player.skills.some(s => s.name === '节命')) {
                const wantJieming = await this.askSkillConfirm(player, '节命',
                    '受到伤害，是否发动【节命】令一名角色将手牌补至其体力上限？');
                if (wantJieming) {
                    const others = this.getAlivePlayers().filter(p => p.id !== player.id);
                    if (others.length > 0) {
                        const target = player.isAI
                            ? others[Math.floor(Math.random() * others.length)]
                            : await this.chooseTarget(player, others, '节命：选择补牌的角色');
                        if (target) {
                            const need = target.maxHp - target.handCards.length;
                            if (need > 0) {
                                this.drawCard(target, need);
                                this.log(`${player.name}发动节命，${target.name}补了${need}张牌`, 'highlight');
                            } else {
                                this.log(`${target.name}手牌已满，节命无效果`, 'normal');
                            }
                        }
                    }
                }
            }
            // 狂骨 (魏延) — 被动技，造成伤害后摸牌
            if (source && source.skills.some(s => s.name === '狂骨')) {
                this.drawCard(source, 1);
                this.log(`${source.name}发动狂骨，摸了1张牌`, 'highlight');
            }
            // 悲歌 (蔡文姬) — 主动技，有角色受【杀】伤害后，蔡文姬可弃牌令其判定
            if (card && card.subtype === 'sha' && source && source.isAlive) {
                const beiGePlayer = this.getAlivePlayers().find(p =>
                    p.id !== player.id && p.skills.some(s => s.name === '悲歌') && p.handCards.length > 0
                );
                if (beiGePlayer) {
                    const wantBeiGe = await this.askSkillConfirm(beiGePlayer, '悲歌',
                        '有角色受到【杀】伤害，是否发动【悲歌】弃置一张牌令其判定？');
                    if (wantBeiGe) {
                        const discardCards = beiGePlayer.isAI ? [beiGePlayer.handCards[0]] :
                            [await this.chooseCard(beiGePlayer, beiGePlayer.handCards, '悲歌：选择弃置的牌')];
                        const discarded = discardCards[0];
                        if (discarded) {
                            this.discardCard(beiGePlayer, discarded);
                            const judge = this.revealTopCard();
                            if (!judge) {
                                this.log(`${beiGePlayer.name}发动悲歌，但牌堆已空，无法判定`, 'normal');
                            } else {
                            this.log(`${beiGePlayer.name}发动悲歌，判定：${SGS.CardData.suitName[judge.suit]}`, 'highlight');
                            switch (judge.suit) {
                                case 'heart': // 红桃：回复1体力
                                    this.heal(player, 1);
                                    this.log(`${player.name}回复1点体力`, 'success');
                                    break;
                                case 'diamond': // 方块：摸两张牌
                                    this.drawCard(player, 2);
                                    this.log(`${player.name}摸了2张牌`, 'success');
                                    break;
                                case 'club': // 梅花：伤害来源弃2张牌
                                    if (source.handCards.length > 0) {
                                        for (let i = 0; i < 2 && source.handCards.length > 0; i++) {
                                            const c = source.isAI
                                                ? source.handCards[Math.floor(Math.random() * source.handCards.length)]
                                                : await this.chooseCard(source, source.handCards, '悲歌：选择弃置来源的一张牌');
                                            if (c) this.discardCard(source, c);
                                        }
                                        this.log(`${source.name}被弃了牌`, 'normal');
                                    }
                                    break;
                                case 'spade': // 黑桃：伤害来源翻面
                                    source.isFlipped = true;
                                    this.log(`${source.name}被翻面`, 'danger');
                                    break;
                            }
                            this.discardPile.push(judge);
                            }
                        }
                    }
                }
            }

            // 检查死亡
            if (player.hp <= 0) {
                await this.handleDying(player, source);
            }
            this.notifyState();
        }

        async propagateChain(player, damage, element, source) {
            const chained = this.getAlivePlayers().filter(p => p.isChained && p.id !== player.id);
            // 先全部解除连环，再逐个结算，使被传导的玩家也能触发受伤技能（天香/反馈/遗计等）
            const processed = new Set();
            for (const p of chained) p.isChained = false;
            for (const p of chained) {
                if (processed.has(p.id)) continue;
                processed.add(p.id);
                this.log(`铁索连环传导！${p.name}受到${damage}点${element === 'fire' ? '火焰' : '雷电'}伤害`, 'danger');
                await this.dealDamage(p, damage, { source, element, chainProcessed: processed });
            }
        }

        // ========== 治疗 ==========
        heal(player, amount) {
            const before = player.hp;
            player.hp = Math.min(player.maxHp, player.hp + amount);
            const healed = player.hp - before;
            // 通知UI显示回血动画
            if (healed > 0) {
                try {
                    this.adapter && this.adapter.notifyEvent({
                        type: 'heal', detail: { playerId: player.id, amount: healed }
                    });
                } catch(e) {}
            }
            return healed;
        }

        // ========== 濒死处理 ==========
        async handleDying(player, killer) {
            this.log(`${player.name}进入濒死状态！`, 'danger');
            this.emit('onDying', { player, killer, engine: this });

            // 检查不屈（周泰）
            if (player.skills.some(s => s.name === '不屈')) {
                const card = this.revealTopCard();
                if (card) {
                    const hasSame = player.buquCards.some(c => c.number === card.number);
                    if (!hasSame) {
                        player.buquCards.push(card);
                        player.hp = 0;
                        this.log(`${player.name}发动不屈！不屈牌：${card.name}(${card.number})`, 'highlight');
                        return;
                    } else {
                        this.discardPile.push(card); // 不屈失败：揭示的牌不再作为不屈标记，应入弃牌堆，避免凭空消失
                        this.log(`${player.name}不屈失败（点数重复）`, 'danger');
                    }
                }
            }

            // 尝试求桃
            await this.requestTao(player, killer);
        }

        async requestTao(player, killer) {
            try {
                // 完杀 (贾诩): 只有濒死角色和完杀拥有者可以使用桃
                const hasWanSha = this.getAlivePlayers().some(p => p.skills.some(s => s.name === '完杀'));
                
                // 遍历所有存活玩家求桃
                const alive = this.getAlivePlayers();
                for (const p of alive) {
                    // 完杀：只有濒死角色和自己可以救
                    if (hasWanSha && p.id !== player.id && !p.skills.some(s => s.name === '完杀')) {
                        continue;
                    }
                    if (!p.handCards || p.handCards.length === 0) continue;
                    const tao = p.handCards.find(c => c.subtype === 'tao');
                    if (tao) {
                        if (p.isAI && this.ai) {
                            if (this.ai.shouldSaveTeammate(p, player, this)) {
                                this.discardCard(p, tao);
                                let extraHeal = 1;
                                // 救援 (孙权 主公技): 吴势力角色濒死用桃额外回复1点
                                if (player.faction === 'wu' && this.getAlivePlayers().some(l => l.skills.some(s => s.name === '救援'))) {
                                    extraHeal += 1;
                                    this.log(`救援：${player.name}额外回复1点体力`, 'success');
                                }
                                this.heal(player, extraHeal);
                                this.log(`${p.name}为${player.name}使用了桃`, 'success');
                                if (player.hp > 0) return;
                            }
                        } else if (!p.isAI) {
                            // 人类玩家：弹窗询问是否使用桃（自救或救他人皆可）
                            const askMsg = (p.id === player.id)
                                ? '你已濒死！是否使用【桃】自救？'
                                : `是否使用【桃】救濒死的${player.name}？`;
                            const wantTao = await this.askSkillConfirm(p, '桃', askMsg);
                            if (wantTao) {
                                this.discardCard(p, tao);
                                let extraHeal = 1;
                                // 救援 (孙权 主公技): 吴势力角色濒死用桃额外回复1点
                                if (player.faction === 'wu' && this.getAlivePlayers().some(l => l.skills.some(s => s.name === '救援'))) {
                                    extraHeal += 1;
                                    this.log(`救援：${player.name}额外回复1点体力`, 'success');
                                }
                                this.heal(player, extraHeal);
                                this.log(`${p.name}为${player.name}使用了桃`, 'success');
                                if (player.hp > 0) return;
                            }
                        }
                    }
                    // 酒：濒死时可将【酒】当【桃】自救（仅限自身；契合卡面"濒死时使用回复1点体力"）
                    const jiuSelf = (p.id === player.id) ? p.handCards.find(c => c.subtype === 'jiu') : null;
                    if (jiuSelf) {
                        if (p.isAI && this.ai) {
                            if (this.ai.shouldSaveTeammate(p, player, this)) {
                                this.discardCard(p, jiuSelf);
                                this.heal(player, 1);
                                this.log(`${p.name}在濒死时使用【酒】自救`, 'success');
                                if (player.hp > 0) return;
                            }
                        } else if (p === this.getHumanPlayer()) {
                            const wantJiu = await this.askSkillConfirm(p, '酒', '是否使用【酒】自救（恢复1点体力）？');
                            if (wantJiu) {
                                this.discardCard(p, jiuSelf);
                                this.heal(player, 1);
                                this.log(`${p.name}在濒死时使用【酒】自救`, 'success');
                                if (player.hp > 0) return;
                            }
                        }
                    }
                    // 急救（人类与AI均可发动：将红色手牌当桃救濒死角色）
                    if (p.skills && p.skills.some(s => s.name === '急救')) {
                        const redCards = p.handCards.filter(c => c.suit === 'heart' || c.suit === 'diamond');
                        if (redCards.length > 0) {
                            let useCard = null;
                            if (p.isAI && this.ai) {
                                if (this.ai.shouldSaveTeammate(p, player, this)) useCard = redCards[0];
                            } else {
                                const want = await this.askSkillConfirm(p, '急救',
                                    `是否发动【急救】，将红色手牌当【桃】救${player.name}？`);
                                if (want) {
                                    const chosen = await this.chooseCard(p, redCards, '急救：选择当【桃】的红色牌');
                                    if (chosen) useCard = chosen;
                                }
                            }
                            if (useCard) {
                                this.discardCard(p, useCard);
                                this.heal(player, 1);
                                this.log(`${p.name}发动急救救了${player.name}`, 'success');
                                if (player.hp > 0) return;
                            }
                        }
                    }
                }
            } catch(e) {
                console.error('requestTao异常:', e);
            }

            // 没人救活
            await this.killPlayer(player, killer);
        }

        async killPlayer(player, killer) {
            // 涅槃 (庞统) — 限定技，仅能发动一次
            if (player.skills.some(s => s.name === '涅槃') && player.isAlive && !player.niepanUsed) {
                player.niepanUsed = true;
                player.hp = 3;
                // 弃置所有牌
                for (const c of [...player.handCards]) {
                    this.discardPile.push(c);
                }
                player.handCards = [];
                for (const slot of ['weapon', 'armor', 'horsePlus', 'horseMinus']) {
                    if (player.equipment[slot]) {
                        this.discardPile.push(player.equipment[slot]);
                        player.equipment[slot] = null;
                    }
                }
                this.log(`${player.name}发动【涅槃】，复活至3点体力！`, 'highlight');
                this.notifyState();
                return;
            }

            player.isAlive = false;
            player.hp = 0;
            this.log(`【${player.name}(${player.hero.name})阵亡！】`, 'danger');

            // 记录对局事件
            this.addMatchEvent('player_death', {
                player: player.name,
                hero: player.hero.name,
                killer: killer?.name
            });

            // 收集死者所有牌
            const deadCards = [...player.handCards, ...player.judgmentCards];
            for (const slot of ['weapon', 'armor', 'horsePlus', 'horseMinus']) {
                if (player.equipment[slot]) deadCards.push(player.equipment[slot]);
            }

            // 行殇 (曹丕): 其他角色死亡时，曹丕可获得其所有牌
            let xingshangUsed = false;
            const xingshangOwner = this.getAlivePlayers().find(p => p.skills.some(s => s.name === '行殇'));
            if (xingshangOwner && deadCards.length > 0 && xingshangOwner.id !== player.id) {
                const want = xingshangOwner.isAI ? true : await this.askSkillConfirm(xingshangOwner, '行殇', `${player.name}死亡，是否发动【行殇】获得其所有牌？`);
                if (want) {
                    for (const c of deadCards) xingshangOwner.handCards.push(c);
                    xingshangUsed = true;
                    this.log(`${xingshangOwner.name}发动行殇，获得了${deadCards.length}张牌`, 'highlight');
                }
            }

            // 若未发动行殇，弃置死者所有牌
            if (!xingshangUsed) {
                for (const c of deadCards) this.discardPile.push(c);
            }
            player.handCards = [];
            player.judgmentCards = [];
            for (const slot of ['weapon', 'armor', 'horsePlus', 'horseMinus']) player.equipment[slot] = null;

            // 触发死亡事件
            this.emit('onPlayerDeath', { player, killer, engine: this });

            // 断肠
            if (player.skills.some(s => s.name === '断肠') && killer) {
                this.log(`${killer.name}受到断肠影响，失去所有技能！`, 'danger');
                killer.hero = { ...killer.hero, skills: [] };
            }

            // 武魂 (神关羽): 死亡时令梦魇标记最多者死亡
            if (player.skills.some(s => s.name === '武魂')) {
                const candidates = this.getAlivePlayers().filter(p => p.id !== player.id && p.tokens && p.tokens['梦魇'] > 0);
                if (candidates.length > 0) {
                    candidates.sort((a, b) => (b.tokens['梦魇'] || 0) - (a.tokens['梦魇'] || 0));
                    const victim = candidates[0];
                    this.log(`${player.name}发动武魂，${victim.name}因梦魇过多而亡！`, 'danger');
                    victim.hp = 0;
                    await this.killPlayer(victim, player);
                }
            }

            // 身份局奖惩
            if (this.gameMode !== 'national') {
                this.handleDeathReward(player, killer);
            } else {
                this.handleNationalDeath(player, killer);
            }

            // 检查游戏结束
            if (this.checkGameOver()) {
                this.endGame();
            }

            this.notifyState();
        }

        handleDeathReward(player, killer) {
            if (!killer) return;
            // 杀反贼摸3张
            if (player.identity === 'rebel') {
                this.drawCard(killer, 3);
                this.log(`${killer.name}击杀反贼，摸3张牌`, 'highlight');
            }
            // 主公杀忠臣弃所有牌（手牌+装备均入弃牌堆，避免凭空消失）
            if (player.identity === 'loyal' && killer.identity === 'lord') {
                for (const c of killer.handCards) this.discardPile.push(c);
                for (const slot of ['weapon', 'armor', 'horsePlus', 'horseMinus']) {
                    if (killer.equipment[slot]) this.discardPile.push(killer.equipment[slot]);
                }
                killer.handCards = [];
                killer.equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
                this.log(`主公杀忠臣，弃所有牌！`, 'danger');
            }
        }

        handleNationalDeath(player, killer) {
            if (!killer || !player.heroRevealed) return;
            // 同势力杀同势力：弃所有牌（手牌+装备均入弃牌堆，避免凭空消失）
            if (killer.faction === player.faction) {
                for (const c of killer.handCards) this.discardPile.push(c);
                for (const slot of ['weapon', 'armor', 'horsePlus', 'horseMinus']) {
                    if (killer.equipment[slot]) this.discardPile.push(killer.equipment[slot]);
                }
                killer.handCards = [];
                killer.equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
                this.log(`${killer.name}杀了同势力，弃所有牌！`, 'danger');
            } else {
                // 杀异势力：摸X张
                const factionCount = this.getAlivePlayers().filter(p => p.faction === player.faction).length + 1;
                const drawCount = killer.isAmbitious ? 3 : Math.min(factionCount, 3);
                this.drawCard(killer, drawCount);
                this.log(`${killer.name}击杀异势力，摸${drawCount}张`, 'highlight');
            }
        }

        // ========== 胜利条件 ==========
        checkGameOver() {
            if (this.gameMode === 'national') {
                return this.checkNationalGameOver();
            }
            return this.checkStandardGameOver();
        }

        checkStandardGameOver() {
            const alive = this.getAlivePlayers();
            const lord = alive.find(p => p.isLord);
            const rebels = alive.filter(p => p.identity === 'rebel');
            const spies = alive.filter(p => p.identity === 'spy');
            const loyals = alive.filter(p => p.identity === 'loyal');

            // 主公死亡
            if (!lord) {
                if (spies.length === 1 && rebels.length === 0 && loyals.length === 0) {
                    this.winner = ['spy'];
                    this.log('内奸获胜！', 'highlight');
                } else {
                    this.winner = ['rebel'];
                    this.log('反贼获胜！', 'highlight');
                }
                return true;
            }
            // 反贼和内奸全死
            if (rebels.length === 0 && spies.length === 0) {
                this.winner = ['lord', 'loyal'];
                this.log('主公和忠臣获胜！', 'highlight');
                return true;
            }
            return false;
        }

        checkNationalGameOver() {
            const alive = this.getAlivePlayers();
            const revealedAlive = alive.filter(p => p.heroRevealed);
            if (revealedAlive.length < alive.length) return false;

            const factions = new Set(revealedAlive.map(p => p.isAmbitious ? `amb_${p.id}` : p.faction));
            if (factions.size === 1) {
                const faction = [...factions][0];
                if (faction.startsWith('amb_')) {
                    this.winner = [faction.replace('amb_', '')];
                    this.log(`野心家获胜！`, 'highlight');
                } else {
                    this.winner = revealedAlive.filter(p => p.faction === faction).map(p => p.id);
                    this.log(`${SGS.HeroData.factionName[faction]}势力获胜！`, 'highlight');
                }
                return true;
            }
            return false;
        }

        endGame() {
            this.gameOver = true;
            
            // 判断人类玩家胜负
            const humanPlayer = this.players.find(p => !p.isAI);
            const isWin = humanPlayer && this.winner && this.winner.includes(humanPlayer.id);
            const result = isWin ? 'win' : 'lose';
            
            // 停止实时日志上传
            this.stopRealtimeLogUpload();
            
            // 保存对局记录
            this.saveMatchLog(result);
            
            this.adapter && this.adapter.notifyGameOver({
                winner: this.winner,
                players: this.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    hero: p.hero.name,
                    identity: p.identity,
                    faction: p.faction,
                    isAlive: p.isAlive,
                })),
                result: result,
            });
            this.notifyState();
        }

        // ========== 技能使用 ==========
        async useSkill(player, skillName, params = {}) {
            const skill = player.skills.find(s => s.name === skillName);
            if (!skill) return false;

            // 记录对局事件
            this.addMatchEvent('use_skill', {
                player: player.name,
                skill: skillName,
                params: params
            });

            switch (skillName) {
                case '制衡':
                    if (params.cards && params.cards.length > 0) {
                        for (const c of params.cards) {
                            this.discardCard(player, c);
                        }
                        this.drawCard(player, params.cards.length);
                        this.log(`${player.name}发动制衡，换了${params.cards.length}张牌`, 'highlight');
                        player.skillStates = player.skillStates || {};
                        player.skillStates.zhihengUsed = true;
                    }
                    break;
                case '苦肉':
                    player.hp -= 1;
                    this.drawCard(player, 2);
                    this.log(`${player.name}发动苦肉，失去1体力摸2牌`, 'highlight');
                    player.skillStates = player.skillStates || {};
                    player.skillStates.kuruUsed = true;
                    if (player.hp <= 0) await this.handleDying(player, player);
                    break;
                case '仁德':
                    if (params.targetId !== undefined && params.cards && params.cards.length > 0) {
                        const target = this.players[params.targetId];
                        for (const c of params.cards) {
                            const idx = player.handCards.indexOf(c);
                            if (idx >= 0) {
                                player.handCards.splice(idx, 1);
                                target.handCards.push(c);
                            }
                        }
                        if (params.cards.length >= 2 && player.hp < player.maxHp) {
                            this.heal(player, 1);
                            this.log(`${player.name}仁德给出${params.cards.length}张牌，回复1体力`, 'success');
                        }
                        this.log(`${player.name}给${target.name}了${params.cards.length}张牌`, 'highlight');
                    }
                    break;
                case '奇袭':
                    if (params.targetId !== undefined) {
                        const target = this.players[params.targetId];
                        const blackCard = params.card;
                        const idx = player.handCards.indexOf(blackCard);
                        if (idx >= 0 && (blackCard.suit === 'spade' || blackCard.suit === 'club')) {
                            player.handCards.splice(idx, 1);
                            this.discardPile.push(blackCard);
                            // 过河拆桥效果
                            if (target.handCards.length > 0) {
                                const c = target.handCards[Math.floor(Math.random() * target.handCards.length)];
                                this.discardCard(target, c);
                                this.log(`${player.name}奇袭拆了${target.name}的${c.name}`, 'highlight');
                            }
                        }
                    }
                    break;
                case '反间':
                    if (params.targetId !== undefined) {
                        const target = this.players[params.targetId];
                        if (target.handCards.length > 0) {
                            const c = target.handCards[Math.floor(Math.random() * target.handCards.length)];
                            this.log(`${player.name}对${target.name}发动反间`, 'highlight');
                            // 目标选择花色，展示手牌
                            const declaredSuit = params.suit || ['spade','heart','club','diamond'][Math.floor(Math.random()*4)];
                            this.log(`${target.name}猜测花色为${SGS.CardData.suitName[declaredSuit]}`, 'normal');
                            this.log(`反间牌为${SGS.CardData.suitName[c.suit]}${c.name}`, 'normal');
                            target.handCards.splice(target.handCards.indexOf(c), 1);
                            if (c.suit !== declaredSuit) {
                                // 注意：反间会把展示牌 c 交给周瑜；此处故意不把 c 作为伤害来源牌传入，
                                // 否则若目标持有【奸雄】，奸雄会把 c 也收入目标手牌，导致同一张牌同时出现在周瑜与目标手中。
                                await this.dealDamage(target, 1, { source: player, card: null });
                                this.log(`${target.name}猜错花色，受到1点伤害`, 'danger');
                            }
                            player.handCards.push(c);
                            this.log(`${player.name}获得了${c.name}`, 'normal');
                        }
                    }
                    player.skillStates = player.skillStates || {};
                    player.skillStates.fanjianUsed = true;
                    break;
                case '结姻':
                    if (params.targetId !== undefined && params.cards && params.cards.length >= 2) {
                        const target = this.players[params.targetId];
                        for (const c of params.cards) {
                            this.discardCard(player, c);
                        }
                        if (player.hp < player.maxHp) this.heal(player, 1);
                        if (target.hp < target.maxHp) this.heal(target, 1);
                        this.log(`${player.name}与${target.name}结姻，各回1体力`, 'success');
                        player.skillStates = player.skillStates || {};
                        player.skillStates.jieyinUsed = true;
                    }
                    break;
                case '青囊':
                    if (params.targetId !== undefined) {
                        const target = this.players[params.targetId];
                        const card = params.card;
                        if (card) {
                            this.discardCard(player, card);
                            this.heal(target, 1);
                            this.log(`${player.name}青囊为${target.name}回1体力`, 'success');
                            player.skillStates = player.skillStates || {};
                            player.skillStates.qingnangUsed = true;
                        }
                    }
                    break;
                case '离间':
                    if (params.targetId !== undefined && params.targetId2 !== undefined) {
                        const t1 = this.players[params.targetId];
                        const t2 = this.players[params.targetId2];
                        const card = params.card;
                        if (card) {
                            this.discardCard(player, card);
                            this.log(`${player.name}离间${t1.name}和${t2.name}决斗`, 'highlight');
                            player.skillStates = player.skillStates || {};
                            player.skillStates.lijianUsed = true;
                            await this.resolveDuel(t1, t2, card);
                        }
                    }
                    break;
                case '挑衅':
                    if (params.targetId !== undefined) {
                        const target = this.players[params.targetId];
                        const sha = await this.requestResponse(target, 'sha', player);
                        if (sha) {
                            await this.resolveSha(target, player, sha, 1);
                        } else if (target.handCards.length > 0) {
                            const c = target.handCards[Math.floor(Math.random() * target.handCards.length)];
                            this.discardCard(target, c);
                            this.log(`${target.name}无法出杀，被弃1牌`, 'normal');
                        }
                    }
                    break;
                case '据守':
                    this.drawCard(player, 3);
                    player.isFlipped = true;
                    this.log(`${player.name}发动据守，摸3张并翻面`, 'highlight');
                    player.skillStates = player.skillStates || {};
                    player.skillStates.jushouUsed = true;
                    break;
                case '乱击':
                    if (params.cards && params.cards.length === 2) {
                        const c1 = player.handCards.indexOf(params.cards[0]);
                        const c2 = player.handCards.indexOf(params.cards[1]);
                        if (c1 >= 0 && c2 >= 0 && params.cards[0].suit === params.cards[1].suit) {
                            player.handCards.splice(Math.max(c1, c2), 1);
                            player.handCards.splice(Math.min(c1, c2), 1);
                            // 两张同花色牌已从手牌移除，须入弃牌堆，否则会凭空从对局消失（同类于铁索重铸/五谷泄漏）
                            this.discardPile.push(params.cards[0]);
                            this.discardPile.push(params.cards[1]);
                            const others = this.getAlivePlayers().filter(p => p.id !== player.id);
                            for (const p of others) {
                                if (!p.isAlive) continue;
                                const shan = await this.requestResponse(p, 'shan', player);
                            if (!shan) {
                                // 乱击=万箭齐发式的范围伤害，非实体【杀】，不传入 card；
                                // 否则若该目标持有【奸雄】，会把一个无 instanceId 的畸形牌对象塞入手牌。
                                await this.dealDamage(p, 1, { source: player, card: null });
                            }
                            }
                            this.log(`${player.name}发动乱击(万箭齐发)`, 'highlight');
                        }
                    }
                    break;
                case '强袭':
                    if (params.targetId !== undefined) {
                        const target = this.players[params.targetId];
                        const weapon = player.equipment.weapon;
                        if (weapon) {
                            this.discardPile.push(weapon);
                            player.equipment.weapon = null;
                        } else {
                            player.hp -= 1;
                            if (player.hp <= 0) {
                                await this.handleDying(player, player);
                                if (!player.isAlive) {
                                    this.log(`${player.name}发动强袭后濒死身亡`, 'danger');
                                    break;
                                }
                            }
                        }
                        await this.dealDamage(target, 1, { source: player });
                        this.log(`${player.name}对${target.name}发动强袭`, 'highlight');
                        player.skillStates = player.skillStates || {};
                        player.skillStates.qiangxiUsed = true;
                    }
                    break;
                case '驱虎':
                    // 荀彧：与目标拼点，赢则对其攻击范围内一名角色造成1点伤害（出牌阶段限一次）
                    if (player.skillStates && player.skillStates.qutigerUsed) return false;
                    if (params.targetId !== undefined) {
                        const target = this.players[params.targetId];
                        if (player.handCards.length > 0 && target.handCards.length > 0) {
                            const myCard = player.handCards[Math.floor(Math.random() * player.handCards.length)];
                            const targetCard = target.handCards[Math.floor(Math.random() * target.handCards.length)];
                            this.log(`${player.name}驱虎：${myCard.number} vs ${targetCard.number}`, 'normal');
                            if (myCard.number > targetCard.number) {
                                // 赢：对【对手】攻击范围内的一名角色造成1点伤害（而非荀彧本人的攻击范围）
                                const targetsInRange = this.getAlivePlayers().filter(p => 
                                    p.id !== player.id && this.getDistance(target, p) <= target.weaponRange
                                );
                                if (targetsInRange.length > 0) {
                                    const damaged = targetsInRange[0]; // 简化：选第一个
                                    await this.dealDamage(damaged, 1, { source: player });
                                    this.log(`驱虎：拼点获胜，${damaged.name}受到1点伤害`, 'danger');
                                } else {
                                    // 对手攻击范围内无人，直接对对手造成伤害
                                    await this.dealDamage(target, 1, { source: player });
                                    this.log(`驱虎：拼点获胜，范围内无目标，${target.name}受到1点伤害`, 'danger');
                                }
                            } else {
                                await this.dealDamage(player, 1, { source: player });
                                this.log(`${player.name}拼点失败，受到1点伤害`, 'danger');
                            }
                            this.discardCard(player, myCard);
                            this.discardCard(target, targetCard);
                            // 仅在实际发生拼点后标记本回合已用（出牌阶段限一次）
                            player.skillStates = player.skillStates || {};
                            player.skillStates.qutigerUsed = true;
                        }
                    }
                    break;
                case '节命':
                    // 主公技：其他魏将死亡时摸牌
                    // 在killPlayer中处理
                    break;
                case '完杀':
                    // 贾诩：只有自己和濒死角色能求桃
                    player.skillStates = player.skillStates || {};
                    player.skillStates['完杀'] = true;
                    this.log(`${player.name}发动完杀`, 'highlight');
                    break;
                case '乱武':
                    // 贾诩：所有其他角色对距离最近的其他角色出杀（不能选自己），否则失去1点体力
                    const aliveOthers = this.getAlivePlayers().filter(p => p.id !== player.id);
                    for (const p of aliveOthers) {
                        if (!p.isAlive) continue;
                        // 找距离最近的其他角色（排除自己）
                        const otherPlayers = this.getAlivePlayers().filter(q => q.id !== p.id);
                        if (otherPlayers.length === 0) continue;
                        // 计算距离，找最近的
                        let nearest = otherPlayers[0];
                        let minDist = this.getDistance(p, nearest);
                        for (const q of otherPlayers) {
                            const d = this.getDistance(p, q);
                            if (d < minDist) { minDist = d; nearest = q; }
                        }
                        const sha = await this.requestResponse(p, 'sha', player);
                        if (!sha) {
                            await this.dealDamage(p, 1, { source: player });
                            this.log(`${p.name}乱武未能出杀，失去1点体力`, 'danger');
                        } else {
                            this.log(`${p.name}乱武对${nearest.name}使用了杀`, 'normal');
                            await this.resolveSha(p, nearest, sha, 1);
                        }
                    }
                    this.log(`${player.name}发动乱武`, 'danger');
                    break;
                case '帷幕':
                    // 贾诩：黑色锦囊对你无效
                    player.skillStates = player.skillStates || {};
                    player.skillStates['帷幕'] = true;
                    this.log(`${player.name}帷幕生效`, 'highlight');
                    break;
                case '神速':
                    // 神速已在回合开始阶段(doBegin)统一触发；
                    // 此处为 UI 兜底：回合开始技能不应在出牌阶段由 useSkill 发起，直接忽略
                    this.log(`${player.name}的【神速】仅在回合开始时发动`, 'normal');
                    break;
                case '断粮':
                    // 徐晃: 将黑色非装备牌当【兵粮寸断】使用，距离为2
                    if (params.targetId !== undefined && params.card) {
                        const card = params.card;
                        if ((card.suit === 'spade' || card.suit === 'club') && card.type !== 'equip') {
                            const target = this.players[params.targetId];
                            const dist = this.getDistance(player, target);
                            if (dist <= 2) {
                                this.discardCard(player, card);
                                const bingliang = { name:'兵粮寸断(断粮)', subtype:'bingliang' };
                                target.judgmentCards.push(bingliang);
                                this.log(`${player.name}断粮：对${target.name}使用了兵粮寸断`, 'highlight');
                            }
                        }
                    }
                    break;
                case '酒池':
                    // 董卓：可以将黑桃手牌当【酒】使用
                    if (params.card && params.card.suit === 'spade') {
                        this.discardCard(player, params.card);
                        player.drunk = true; // 设置酒效果
                        player.jiuUsedThisTurn = true;
                        this.log(`${player.name}酒池：将黑桃牌当酒使用`, 'highlight');
                    }
                    break;
                case '崩坏':
                    // 董卓：核对一下体力是不是全场最少，如果体力不是最少，失去1点体力
                    const minHp = Math.min(...this.getAlivePlayers().map(p => p.hp));
                    if (player.hp > minHp) {
                        player.hp -= 1;
                        this.log(`${player.name}崩坏：失去1点体力`, 'danger');
                        if (player.hp <= 0) await this.handleDying(player, player);
                    } else {
                        this.log(`${player.name}崩坏：体力已是最低，不触发`, 'normal');
                    }
                    break;
                case '天义':
                    if (player.skillStates && player.skillStates.tianyiUsed) return false;
                    if (params.targetId !== undefined) {
                        const target = this.players[params.targetId];
                        // 简化拼点
                        const myCard = player.handCards[Math.floor(Math.random() * player.handCards.length)];
                        const targetCard = target.handCards[Math.floor(Math.random() * target.handCards.length)];
                        if (myCard && targetCard) {
                            this.log(`${player.name}(${myCard.number}) vs ${target.name}(${targetCard.number})拼点`, 'normal');
                            if (myCard.number > targetCard.number) {
                                player.shaLimitOverride = 2;
                                this.log(`${player.name}天义成功，本回合可出2杀`, 'success');
                            } else {
                                this.log(`${player.name}天义失败`, 'normal');
                            }
                            this.discardCard(player, myCard);
                            this.discardCard(target, targetCard);
                            player.skillStates = player.skillStates || {};
                            player.skillStates.tianyiUsed = true;
                        }
                    }
                    break;
                case '国色':
                    if (player.skillStates && player.skillStates.guoseUsed) return false;
                    if (params.targetId !== undefined && params.card) {
                        const target = this.players[params.targetId];
                        const card = params.card;
                        if (card.suit === 'diamond') {  // 方块牌当乐不思蜀
                            this.discardCard(player, card);
                            // 放置乐不思蜀
                            const lebu = { name: '乐不思蜀(国色)', subtype: 'lebusi' };
                            target.judgmentCards.push(lebu);
                            player.skillStates = player.skillStates || {};
                            player.skillStates.guoseUsed = true;
                            this.log(`${player.name}对${target.name}使用国色`, 'highlight');
                        }
                    }
                    break;
                case '好施':
                    // 摸牌阶段多摸2张，然后交给手牌最少者
                    player.skillStates = player.skillStates || {};
                    player.skillStates['好施'] = true;
                    this.log(`${player.name}发动好施`, 'highlight');
                    break;
                case '缔盟':
                    if (params.targetId !== undefined) {
                        const target = this.players[params.targetId];
                        // 交换手牌
                        const tempHand = [...player.handCards];
                        player.handCards = [...target.handCards];
                        target.handCards = tempHand;
                        this.log(`${player.name}与${target.name}缔盟交换了手牌`, 'highlight');
                    }
                    break;
                // ========== 剩余技能 ==========
                case '巧变':
                    // 张郃: 可以弃一张手牌跳过判定/摸牌/出牌阶段；出牌阶段可移动场上一张装备或判定牌
                    if (params.skipPhase) {
                        const phaseMap = { judge: '_skipJudge', draw: '_skipDraw', play: '_skipPlay' };
                        if (phaseMap[params.skipPhase]) {
                            player[phaseMap[params.skipPhase]] = true;
                            this.log(`${player.name}巧变：跳过${params.skipPhase}阶段`, 'highlight');
                        }
                    } else if (params.moveCard && params.fromId !== undefined && params.toId !== undefined) {
                        // 移动装备或判定牌
                        const from = this.players[params.fromId];
                        const to = this.players[params.toId];
                        if (from && to && from.equipment[params.moveCard]) {
                            const equip = from.equipment[params.moveCard];
                            // 目标位置如果有装备先弃掉
                            if (to.equipment[params.moveCard]) {
                                this.discardPile.push(to.equipment[params.moveCard]);
                            }
                            from.equipment[params.moveCard] = null;
                            to.equipment[params.moveCard] = equip;
                            this.log(`${player.name}巧变：移动了${equip.name}`, 'highlight');
                        }
                    } else {
                        // 默认：弃一张牌跳过阶段或作为基础操作
                        if (params.card) {
                            this.discardCard(player, params.card);
                            this.log(`${player.name}巧变：弃牌发动`, 'highlight');
                        }
                    }
                    break;
                case '魂姿':
                    // 孙策觉醒技：体力=1时减1点体力上限，获得"英姿"和"英魂"
                    if (player.hp === 1 && !player.skills.some(s => s.name === '魂姿觉醒')) {
                        player.skills.push({ name: '魂姿觉醒', type: 'locked', desc: '觉醒技，体力=1时获得"英姿"和"英魂"' });
                        player.skills.push({ name: '英姿', type: 'locked', trigger: 'drawPhase', desc: '摸牌阶段多摸一张牌' });
                        player.skills.push({ name: '英魂', type: 'active', trigger: 'turnBegin', desc: '回合开始时若已受伤，令一名角色摸X弃Y' });
                        player.maxHp -= 1;
                        if (player.hp > player.maxHp) player.hp = player.maxHp;
                        this.log(`${player.name}觉醒！减1点体力上限，获得英姿与英魂`, 'highlight');
                    }
                    break;
                case '直谏':
                    // 张昭张纮：可以将装备牌置于其他角色装备区
                    if (params.card && params.targetId !== undefined) {
                        const target = this.players[params.targetId];
                        const card = params.card;
                        if (card.type === 'equip') {
                            this.discardCard(player, card);
                            // 简化：直接给target摸1张牌
                            this.drawCard(target, 1);
                            this.log(`${player.name}直谏，令${target.name}摸1张牌`, 'highlight');
                        }
                    }
                    break;
                case '固政':
                    // 张昭张纮：其他角色弃牌阶段结束时，你可以获得其中一张
                    player.skillStates = player.skillStates || {};
                    player.skillStates['固政'] = true;
                    this.log(`${player.name}固政生效`, 'highlight');
                    break;
                case '化身':
                    // 左慈: 获得若干张"化身"牌（随机武将技能），可使用其中一张的技能
                    if (!player.huazhenPool) {
                        player.huazhenPool = [];
                        // 随机选3个其他武将作为化身
                        const allHeroes = SGS.HeroData ? [...SGS.HeroData.heroes].filter(h => h.id !== (player.hero && player.hero.id)) : [];
                        if (allHeroes.length > 0) {
                            for (let i = 0; i < 3 && allHeroes.length > 0; i++) {
                                const ri = Math.floor(Math.random() * allHeroes.length);
                                player.huazhenPool.push(allHeroes.splice(ri, 1)[0]);
                            }
                        }
                        this.log(`${player.name}化身：获得了${player.huazhenPool.length}张化身牌`, 'highlight');
                    }
                    // 每次使用化身技能：随机获得化身池中一个技能的效果
                    if (player.huazhenPool && player.huazhenPool.length > 0) {
                        const chosenHero = player.huazhenPool[Math.floor(Math.random() * player.huazhenPool.length)];
                        const chosenSkill = chosenHero.skills[Math.floor(Math.random() * chosenHero.skills.length)];
                        this.log(`${player.name}化身：变成了${chosenHero.name}，使用${chosenSkill.name}`, 'highlight');
                        // 简化：获得1张牌作为化身效果
                        this.drawCard(player, 1);
                    } else {
                        this.drawCard(player, 1);
                        this.log(`${player.name}化身：获得牌堆顶的牌`, 'highlight');
                    }
                    break;
                case '悲歌':
                    // 蔡文姬：角色死亡时摸牌
                    player.skillStates = player.skillStates || {};
                    player.skillStates['悲歌'] = true;
                    this.log(`${player.name}悲歌：角色死亡时可摸牌`, 'highlight');
                    break;
                case '蛊惑':
                    // 左慈：可以用一张牌当作任意基本牌或非延时锦囊
                    if (params.card && params.asCard) {
                        this.discardCard(player, params.card);
                        this.log(`${player.name}蛊惑：将${params.card.name}当作${params.asCard}使用`, 'highlight');
                    }
                    break;
                // 注：神周瑜/神曹操/神赵云 暂未加入武将池，琴音/业炎/归心/飞影/龙魂 待接入
                case '八阵':
                    // 诸葛亮：锁定技，若你没有手牌，视为拥有八卦阵
                    if (player.handCards.length === 0) {
                        player.skillStates = player.skillStates || {};
                        player.skillStates['八阵'] = true;
                        this.log(`${player.name}八阵：视为装备八卦阵`, 'highlight');
                    }
                    break;
                case '火计':
                    // 诸葛亮：可以将红色手牌当【火攻】使用（走真正的火攻结算）
                    if (params.card && params.targetId !== undefined) {
                        const target = this.players[params.targetId];
                        const card = params.card;
                        if (card.suit === 'heart' || card.suit === 'diamond') {
                            const idx = player.handCards.indexOf(card);
                            if (idx >= 0) {
                                player.handCards.splice(idx, 1);
                                this.log(`${player.name}发动火计，将红色牌当火攻使用`, 'highlight');
                                const fakeHuogong = { ...card, name: '火攻(火计)', subtype: 'huogong', type: 'trick' };
                                await this.resolveTrickCard(player, fakeHuogong, [target.id]);
                                // 该"火攻"合成牌可能已被奸雄等技能收入某角色手牌，
                                // 统一回收后入弃牌堆，避免同一张牌对象同时存在于手牌与弃牌堆（卡牌重复/洗牌后重复牌）
                                for (const p of this.players) {
                                    const hIdx = p.handCards.indexOf(fakeHuogong);
                                    if (hIdx >= 0) p.handCards.splice(hIdx, 1);
                                }
                                this.discardPile.push(fakeHuogong);
                            }
                        }
                    }
                    break;
                case '看破':
                    // 诸葛亮：可以将一张黑色手牌当无懈可击使用
                    if (params.card && (params.card.suit === 'spade' || params.card.suit === 'club')) {
                        this.discardCard(player, params.card);
                        this.log(`${player.name}看破：将黑色手牌当无懈可击使用`, 'highlight');
                    }
                    break;
                case '连环':
                    // 庞统：可以将黑色手牌当铁索连环使用
                    if (params.card && (params.card.suit === 'spade' || params.card.suit === 'club')) {
                        this.discardCard(player, params.card);
                        if (params.targetIds) {
                            for (const tid of params.targetIds) {
                                const target = this.players[tid];
                                if (target) target.isChained = !target.isChained;
                            }
                        }
                        this.log(`${player.name}连环：使用铁索连环`, 'highlight');
                    }
                    break;
                case '志继':
                    // 姜维觉醒技：体力=1时减1点体力上限，获得"观星"
                    if (player.hp === 1 && !player.skills.some(s => s.name === '志继觉醒')) {
                        player.skills.push({ name: '志继觉醒', type: 'locked', desc: '觉醒技，体力=1时获得"观星"' });
                        player.skills.push({ name: '观星', type: 'active', trigger: 'turnBegin', desc: '回合开始时观看牌堆顶的牌并调整顺序' });
                        player.maxHp -= 1;
                        if (player.hp > player.maxHp) player.hp = player.maxHp;
                        this.drawCard(player, 3);
                        this.log(`${player.name}志继觉醒！减1点体力上限，获得观星，摸3张牌`, 'highlight');
                    }
                    break;
                case '凿险':
                    // 邓艾觉醒技：体力=1时减1点体力上限，获得"屯田"（每回合开始摸1张）
                    if (player.hp === 1 && !player.skills.some(s => s.name === '凿险觉醒')) {
                        player.skills.push({ name: '凿险觉醒', type: 'locked', desc: '觉醒技，体力=1时获得"屯田"' });
                        player.maxHp -= 1;
                        if (player.hp > player.maxHp) player.hp = player.maxHp;
                        // 持久标记：每回合开始摸1张牌（不能用 skillStates，因其每回合被重置）
                        player.hasZaoXianTuntian = true;
                        this.log(`${player.name}凿险觉醒！减1点体力上限，获得屯田`, 'highlight');
                    }
                    break;
                case '神威':
                    // 神吕布觉醒技：狂暴标记达到6时减1点体力上限，获得"神力"
                    if (!player.skills.some(s => s.name === '神威觉醒') && (player.tokens['狂暴'] || 0) >= 6) {
                        player.skills.push({ name: '神威觉醒', type: 'locked', desc: '觉醒技，狂暴标记达到6时减1点体力上限，获得"神力"' });
                        player.skills.push({ name: '神力', type: 'locked', desc: '锁定技，你使用【杀】无视距离' });
                        player.maxHp -= 1;
                        if (player.hp > player.maxHp) player.hp = player.maxHp;
                        this.log(`${player.name}神威觉醒！减1点体力上限，获得"神力"（使用杀无视距离）`, 'highlight');
                    }
                    break;
                case '若愚':
                    // 刘禅觉醒技：体力=1时回复1点并增加1点体力上限，获得享乐
                    if (player.hp === 1 && !player.skills.some(s => s.name === '若愚觉醒')) {
                        player.skills.push({ name: '若愚觉醒', type: 'locked', desc: '觉醒技，体力=1时获得"享乐"' });
                        player.hp += 1;
                        player.maxHp += 1;
                        this.log(`${player.name}若愚觉醒！回复1点体力并增加1点体力上限，获得享乐`, 'highlight');
                    }
                    break;
                case '屯田':
                    // 邓艾：回合开始时摸一张牌
                    if (player.skillStates && player.skillStates['屯田']) {
                        this.drawCard(player, 1);
                        this.log(`${player.name}屯田：摸1张牌`, 'highlight');
                    }
                    break;
            }
            this.notifyState();
            return true;
        }

        // ========== 吴国技能实现 ==========
        // 国色 (大乔): 红牌当乐不思蜀
        // 流离 (大乔): 被杀时转移给攻击范围内角色
        // 谦逊 (陆逊): 不能被顺手/过河
        // 红颜 (小乔): 黑桃当红桃

        // 在useSkill中添加国色
        // 在resolveSha中添加流离
        // 在guohe/shunshou中添加谦逊检查
        // 在card checks中添加红颜

        // ========== 通知状态 ==========
        notifyState() {
            if (this._destroyed) return;
            if (!this.adapter) return;
            const state = this.getState();
            this.adapter.notifyState(state);
        }

        getState() {
            return {
                players: this.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    heroName: p.hero ? p.hero.name : '?',
                    heroFaction: p.hero ? p.hero.faction : null,
                    heroId: p.hero ? p.hero.id : null,
                    hp: p.hp,
                    maxHp: p.maxHp,
                    handCount: p.handCards.length,
                    equipment: p.equipment,
                    judgmentCards: p.judgmentCards.map(c => c.name),
                    identity: p.identity,
                    isAlive: p.isAlive,
                    isAI: p.isAI,
                    isChained: p.isChained,
                    isFlipped: p.isFlipped,
                    isLord: p.isLord,
                    heroRevealed: p.heroRevealed,
                    faction: p.faction,
                    isAmbitious: p.isAmbitious,
                    skills: p.hero ? p.hero.skills.map(s => s.name) : [],
                })),
                currentPlayerIdx: this.currentPlayerIdx,
                phase: this.phase,
                turnCount: this.turnCount,
                deckCount: this.deck.length,
                discardCount: this.discardPile.length,
                gameOver: this.gameOver,
                winner: this.winner,
                logs: this.logs.slice(-20),
                // 添加等待状态，供UI判断是否需要阻止强制推进
                _waitingForGuanxing: this._waitingForGuanxing,
                _waitingForLuoshen: this._waitingForLuoshen,
                _waitingForGuicai: this._waitingForGuicai,
                _waitingForGuidao: this._waitingForGuidao,
            };
        }

        // 获取当前行动玩家
        getCurrentActor() {
            return this.players[this.currentPlayerIdx];
        }

        // 获取人类玩家
        getHumanPlayer() {
            return this.players.find(p => !p.isAI);
        }
    }

    return { GameEngine, Player };
})();
