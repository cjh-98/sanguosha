/**
 * 三国杀UI - 游戏桌面与交互
 */
var SGS = window.SGS = window.SGS || {};

SGS.UI = SGS.UI || {};

SGS.UI.Board = (function() {

    let engine = null;
    let adapter = null;
    let ai = null;
    let config = null;
    let gameStarted = false;
    let selectedCard = null;
    let selectedTarget = null;
    let availableHeroes = [];
    let currentPickPlayer = 0;
    let humanPickCount = 0;
    let maxPickCount = 1;

    // ========== 初始化游戏 ==========
    function initGame(cfg) {
        config = cfg;
        // 创建引擎
        engine = new SGS.GameEngine.GameEngine(cfg);
        // 创建AI
        ai = new SGS.AI.AIPlayer();
        engine.setAI(ai);
        // 创建本地适配器
        adapter = new SGS.Net.LocalAdapter(engine);
        engine.setAdapter(adapter);

        // 设置UI回调
        adapter.setUICallbacks({
            onStateChange: (state) => updateGameBoard(state),
            onEvent: (event) => handleGameEvent(event),
            onGameOver: (result) => showGameOver(result),
            onChoice: async (choiceRequest) => handleChoiceRequest(choiceRequest),
        });

        // 初始化引擎
        engine.init();

        // 开始选将流程
        startHeroSelection();
    }

    // ========== 选将流程 ==========
    function startHeroSelection() {
        currentPickPlayer = 0;
        // 人类玩家选将
        if (config.pickMode === 'random') {
            // 随机抽取武将池
            const banList = config.bannedHeroes;
            availableHeroes = SGS.HeroData.randomPick(10, banList);
            renderHeroSelectScreen(availableHeroes, false);
        } else {
            // 自由选将
            const allHeroes = SGS.HeroData.getAll().filter(h => !config.bannedHeroes.includes(h.id));
            renderHeroSelectScreen(allHeroes, true);
        }
    }

    function renderHeroSelectScreen(heroes, isFree) {
        const el = document.getElementById('heroSelectScreen');
        const isNational = config.mode === 'national';
        el.innerHTML = `
            <div class="select-header">
                <h2>${isNational ? '选择双将（同势力）' : '选择武将'}</h2>
                <p>${isNational ? '请选择两张同势力的武将作为主将和副将' : '从以下武将中选择你的角色'}</p>
            </div>
            <div class="hero-grid" id="heroSelectGrid">
                ${heroes.map(h => `
                    <div class="hero-card" data-hero-id="${h.id}" onclick="SGS.UI.Board.selectHero('${h.id}')">
                        <div class="hero-name">${h.name}</div>
                        <div class="hero-faction ${h.faction}">${SGS.HeroData.factionName[h.faction]}</div>
                        <div class="hero-hp">体力: ${h.maxHp}</div>
                        <div class="hero-skills">${h.skills.map(s => `<div>${s.name}</div>`).join('')}</div>
                    </div>
                `).join('')}
            </div>
            <div class="select-footer">
                <button class="btn btn-small" onclick="SGS.UI.Menu.startSetup()">返回</button>
                <span id="pickInfo" style="color:var(--accent-gold);font-size:14px;align-self:center">
                    ${isNational ? `已选: 0/2` : '请选择1个武将'}
                </span>
                <button class="btn btn-primary" id="confirmHeroBtn" disabled onclick="SGS.UI.Board.confirmHeroSelection()">确认</button>
            </div>
        `;
        // 切换屏幕
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        el.classList.add('active');

        window._selectedHeroIds = [];
        window._maxPick = isNational ? 2 : 1;
    }

    function selectHero(heroId) {
        const card = document.querySelector(`[data-hero-id="${heroId}"]`);
        const idx = window._selectedHeroIds.indexOf(heroId);
        const isNational = config.mode === 'national';

        if (idx >= 0) {
            // 取消选择
            window._selectedHeroIds.splice(idx, 1);
            card.classList.remove('selected');
        } else {
            if (isNational) {
                // 国战：检查同势力
                const hero = SGS.HeroData.getById(heroId);
                if (window._selectedHeroIds.length > 0) {
                    const firstHero = SGS.HeroData.getById(window._selectedHeroIds[0]);
                    if (firstHero.faction !== hero.faction) {
                        alert('国战需要选择同势力的武将！');
                        return;
                    }
                }
            }
            if (window._selectedHeroIds.length < window._maxPick) {
                window._selectedHeroIds.push(heroId);
                card.classList.add('selected');
            } else {
                // 替换最后一个
                const lastId = window._selectedHeroIds[window._selectedHeroIds.length - 1];
                const lastCard = document.querySelector(`[data-hero-id="${lastId}"]`);
                if (lastCard) lastCard.classList.remove('selected');
                window._selectedHeroIds[window._selectedHeroIds.length - 1] = heroId;
                card.classList.add('selected');
            }
        }

        // 更新按钮状态
        const btn = document.getElementById('confirmHeroBtn');
        const info = document.getElementById('pickInfo');
        if (isNational) {
            info.textContent = `已选: ${window._selectedHeroIds.length}/2`;
            btn.disabled = window._selectedHeroIds.length !== 2;
        } else {
            btn.disabled = window._selectedHeroIds.length !== 1;
        }
    }

    function confirmHeroSelection() {
        const selectedIds = window._selectedHeroIds;
        const isNational = config.mode === 'national';

        // 设置人类玩家武将
        if (isNational) {
            const hero1 = SGS.HeroData.getById(selectedIds[0]);
            const hero2 = SGS.HeroData.getById(selectedIds[1]);
            engine.setPlayerHero(0, hero1, hero2);
        } else {
            const hero = SGS.HeroData.getById(selectedIds[0]);
            engine.setPlayerHero(0, hero);
        }

        // AI选将
        for (let i = 1; i < engine.playerCount; i++) {
            if (isNational) {
                // 国战AI选同势力双将
                const factions = Object.values(SGS.HeroData.FACTION).filter(f => f !== 'shen');
                const faction = factions[Math.floor(Math.random() * factions.length)];
                const factionHeroes = SGS.HeroData.getByFaction(faction)
                    .filter(h => !config.bannedHeroes.includes(h.id));
                if (factionHeroes.length >= 2) {
                    const h1 = factionHeroes[Math.floor(Math.random() * factionHeroes.length)];
                    let h2 = factionHeroes[Math.floor(Math.random() * factionHeroes.length)];
                    while (h2.id === h1.id) {
                        h2 = factionHeroes[Math.floor(Math.random() * factionHeroes.length)];
                    }
                    engine.setPlayerHero(i, h1, h2);
                } else {
                    // 随机两个
                    const available = SGS.HeroData.getAll().filter(h => !config.bannedHeroes.includes(h.id));
                    const h1 = available[Math.floor(Math.random() * available.length)];
                    let h2 = available[Math.floor(Math.random() * available.length)];
                    while (h2.id === h1.id) {
                        h2 = available[Math.floor(Math.random() * available.length)];
                    }
                    engine.setPlayerHero(i, h1, h2);
                }
            } else {
                // 每个AI独立选将，排除已选的武将
                const usedIds = engine.players.filter(p => p.hero).map(p => p.hero.id);
                const excludeList = [...config.bannedHeroes, ...usedIds];
                let aiHeroPool;
                if (config.pickMode === 'random') {
                    aiHeroPool = SGS.HeroData.randomPick(5, excludeList);
                } else {
                    aiHeroPool = SGS.HeroData.getAll().filter(h => !excludeList.includes(h.id));
                }
                const chosen = ai.chooseHero(aiHeroPool, engine, i);
                engine.setPlayerHero(i, chosen);
            }
        }

        // 显示身份
        showIdentityReveal();
    }

    function showIdentityReveal() {
        const human = engine.getHumanPlayer();
        const isNational = config.mode === 'national';
        let identityMsg = '';
        if (isNational) {
            identityMsg = `你的势力：${SGS.HeroData.factionName[human.faction]}`;
        } else {
            identityMsg = `你的身份：${SGS.Config.identityName[human.identity]}`;
        }

        const el = document.getElementById('heroSelectScreen');
        el.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:20px;padding:20px">
                <div style="font-size:24px;color:var(--accent-gold);text-align:center">
                    ${identityMsg}
                </div>
                <div style="font-size:18px;color:var(--text-primary)">
                    你的武将：${human.hero.name}${human.nationalHero ? ' & ' + human.nationalHero.name : ''}
                </div>
                <div style="font-size:14px;color:var(--text-secondary);text-align:center;max-width:300px">
                    ${human.identity === 'lord' ? '你是主公！消灭所有反贼和内奸。' :
                      human.identity === 'loyal' ? '你是忠臣！保护主公。' :
                      human.identity === 'rebel' ? '你是反贼！消灭主公。' :
                      human.identity === 'spy' ? '你是内奸！成为最后的幸存者。' :
                      '消灭所有不同势力的角色！'}
                </div>
                <button class="btn btn-primary btn-large" onclick="SGS.UI.Board.startGame()">进入游戏</button>
            </div>
        `;
    }

    function startGame() {
        gameStarted = true;
        // 切换到游戏屏幕
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('gameScreen').classList.add('active');

        // 初始化游戏界面
        renderGameScreen();

        // 开始游戏
        engine.startGame();
    }

    // ========== 游戏界面渲染 ==========
    function renderGameScreen() {
        const el = document.getElementById('gameScreen');
        el.innerHTML = `
            <div class="game-topbar">
                <div class="topbar-info">
                    <span id="turnInfo"></span>
                    <span id="phaseInfo" class="topbar-phase"></span>
                    <div class="phase-indicator" id="phaseIndicator"></div>
                </div>
                <div class="topbar-info">
                    <span id="deckInfo"></span>
                    <button class="topbar-btn" onclick="SGS.UI.Board.toggleLog()">日志</button>
                    <button class="topbar-btn" onclick="SGS.UI.Board.confirmQuit()">退出</button>
                </div>
            </div>
            <!-- 上方对手区域（凸型布局的一部分） -->
            <div class="players-top-area" id="playersTopArea"></div>
            <div class="players-area">
                <div class="players-bottom-area" id="playersBottomArea"></div>
                <div class="center-area">
                    <div class="game-log" id="gameLog"></div>
                    <div class="action-prompt" id="actionPrompt">游戏开始...</div>
                </div>
                <div class="hand-area">
                    <div class="my-info">
                        <div class="my-info-left">
                            <span class="my-hero-name" id="myHeroName"></span>
                            <span class="my-hp" id="myHp"></span>
                            <span id="myIdentity"></span>
                        </div>
                        <div class="equip-zone" id="myEquips"></div>
                    </div>
                    <div class="skill-bar" id="skillBar"></div>
                    <div class="hand-cards" id="handCards"></div>
                    <div class="action-bar" id="actionBar"></div>
                </div>
            </div>
        `;
    }

    function updateGameBoard(state) {
        if (!gameStarted || !state) return;
        const human = engine.getHumanPlayer();
        if (!human) return;
        
        // 确保DOM元素存在（防止在renderGameScreen之前调用）
        if (!document.getElementById('playersTopArea') || !document.getElementById('playersBottomArea')) {
            return; // DOM还没准备好，跳过这次更新
        }
        
        // 检查是否有待处理的卡牌选择（顺手牵羊/过河拆桥等）
        if (engine && engine._pendingCardChoice) {
            const pc = engine._pendingCardChoice;
            const hideInfo = pc.hideInfo || false;
            // 显示卡牌选择UI
            showCardSelector(pc.cards, pc.prompt, hideInfo, (cardId) => {
                const chosen = pc.cards.find(c => c.instanceId === cardId);
                pc.resolve(chosen || null);
            });
            return; // 不继续更新，等待玩家选择
        }

        // 顶部信息
        const currentPlayer = engine.players[state.currentPlayerIdx];
        document.getElementById('turnInfo').textContent = `第${state.turnCount}回合 · ${currentPlayer ? currentPlayer.name : ''}`;
        document.getElementById('phaseInfo').textContent = SGS.Config.phaseName[state.phase] || '';
        
        // 阶段指示器
        const phases = ['begin', 'judge', 'draw', 'play', 'discard', 'end'];
        document.getElementById('phaseIndicator').innerHTML = phases.map(p => 
            `<div class="phase-dot ${state.phase === p ? 'active' : ''}"></div>`
        ).join('');

        document.getElementById('deckInfo').textContent = `牌堆:${state.deckCount}`;


        // 玩家列表 - 凸型布局：上方和下方各放一些对手
        const opponents = state.players.filter((p) => p.id !== human.id);
        const topArea = document.getElementById("playersTopArea");
        const bottomArea = document.getElementById("playersBottomArea");
        
        // 根据玩家数量分配：上方放前一半，下方放后一半
        const midPoint = Math.ceil(opponents.length / 2);
        const topOpponents = opponents.slice(0, midPoint);
        const bottomOpponents = opponents.slice(midPoint);
        
        const renderOpponent = (p, idx) => {
            const factionClass = p.heroRevealed || config.mode !== "national" ? `faction-${p.heroFaction}` : "faction-unknown";
            const factionText = p.heroRevealed || config.mode !== "national" 
                ? SGS.HeroData.factionName[p.heroFaction] || "?" : "?";
            return `
                <div class="player-mini ${idx === state.currentPlayerIdx ? "current" : ""} ${!p.isAlive ? "dead" : ""} ${p.isChained ? "chained" : ""} ${p.isFlipped ? "flipped" : ""}"
                     data-player-id="${p.id}" onclick="SGS.UI.Board.clickPlayer(${p.id})">
                    <div class="pm-name">${p.name}</div>
                    <div class="pm-hero">${p.heroRevealed || config.mode !== "national" ? p.heroName : "???" }
                        ${p.isAmbitious ? "(野心家)" : ""}
                    </div>
                    <div class="pm-hp">${"❤".repeat(Math.max(0, p.hp))}</div>
                    <div class="pm-cards">手牌:${p.handCount}</div>
                    <div class="pm-faction ${factionClass}">${factionText}</div>
                    ${p.judgmentCards.length > 0 ? `<div class="judge-display">${p.judgmentCards.map(c => `<span class="judge-card-mini">${c}</span>`).join("")}</div>` : ""}
                    <div class="equip-zone">
                        ${p.equipment.weapon ? `<span class="equip-item">${p.equipment.weapon.name}</span>` : ""}
                        ${p.equipment.armor ? `<span class="equip-item">${p.equipment.armor.name}</span>` : ""}
                        ${p.equipment.horseMinus ? `<span class="equip-item">-1马</span>` : ""}
                        ${p.equipment.horsePlus ? `<span class="equip-item">+1马</span>` : ""}
                    </div>
                </div>
            `;
        };
        
        topArea.innerHTML = topOpponents.map((p, idx) => renderOpponent(p, idx)).join("");
        bottomArea.innerHTML = bottomOpponents.map((p, idx) => renderOpponent(p, idx)).join("");
        const humanState = state.players[human.id];
        document.getElementById('myHeroName').textContent = `${human.hero.name}`;
        document.getElementById('myHp').textContent = `${'❤'.repeat(Math.max(0, human.hp))} (${human.hp}/${human.maxHp})`;
        
        if (config.mode === 'national') {
            document.getElementById('myIdentity').innerHTML = `<span class="identity-badge" style="background:${SGS.HeroData.factionColor[human.faction]}">${SGS.HeroData.factionName[human.faction]}</span>`;
        } else {
            const identity = human.identity;
            document.getElementById('myIdentity').innerHTML = `<span class="identity-badge ${identity}">${SGS.Config.identityName[identity]}</span>`;
        }

        // 装备
        document.getElementById('myEquips').innerHTML = '';
        for (const [slot, card] of Object.entries(human.equipment)) {
            if (card) {
                document.getElementById('myEquips').innerHTML += `<span class="equip-item">${card.name}</span>`;
            }
        }

        // 手牌
        const isMyTurn = state.currentPlayerIdx === human.id && state.phase === 'play';
        renderHandCards(human, isMyTurn);

        // 技能栏
        renderSkillBar(human, isMyTurn);

        // 操作按钮
        renderActionBar(human, state);

        // 更新提示
        updateActionPrompt(human, state);
    }

    function renderHandCards(human, isMyTurn) {
        const handEl = document.getElementById('handCards');
        const handCards = human.handCards;
        
        handEl.innerHTML = handCards.map((card, idx) => {
            const suitChar = SGS.CardData.suitName[card.suit];
            const colorClass = SGS.CardData.suitColor[card.suit];
            const numberChar = SGS.CardData.numberName[card.number];
            const nameDisplay = card.element === 'fire' ? `火${card.name}` : 
                               card.element === 'thunder' ? `雷${card.name}` : card.name;
            const typeText = card.type === 'basic' ? '基本' : 
                            card.type === 'trick' ? '锦囊' :
                            card.type === 'delay' ? '延时' : '装备';
            const usable = isMyTurn && canUseCard(human, card);
            const selected = selectedCard && selectedCard.instanceId === card.instanceId;
            
            return `
                <div class="card ${colorClass} ${selected ? 'selected' : ''} ${usable ? 'usable' : ''}"
                     data-card-idx="${idx}"
                     onclick="SGS.UI.Board.clickCard(${idx})">
                    <span class="card-suit ${colorClass}">${suitChar}</span>
                    <span class="card-number">${numberChar}</span>
                    <span class="card-name">${nameDisplay}</span>
                    <span class="card-type">${typeText}</span>
                </div>
            `;
        }).join('');
    }

    function canUseCard(player, card) {
        if (!engine) return false;
        // 基本判断
        if (card.subtype === 'shan') return false;
        if (card.subtype === 'tao' && player.hp >= player.maxHp) return false;
        if (card.subtype === 'sha') {
            if (player.shaUsedThisTurn >= 1) {
                const hasZhuge = player.equipment.weapon && player.equipment.weapon.subtype === 'zhuge';
                const hasPaoxiao = player.skills.some(s => s.name === '咆哮');
                if (!hasZhuge && !hasPaoxiao) return false;
            }
            return engine.getAttackTargets(player).length > 0;
        }
        return true;
    }

    function renderSkillBar(human, isMyTurn) {
        const skillBar = document.getElementById('skillBar');
        if (!human.hero || !human.hero.skills) {
            skillBar.innerHTML = '';
            return;
        }
        const skills = human.hero.skills;
        skillBar.innerHTML = skills.map(s => {
            const usable = isMyTurn && isSkillUsable(human, s);
            return `<button class="skill-btn ${usable ? 'usable' : ''}" 
                         onclick="SGS.UI.Board.clickSkill('${s.name}')" 
                         ${usable ? '' : 'disabled'}>${s.name}</button>`;
        }).join('');
    }

    function isSkillUsable(player, skill) {
        switch (skill.name) {
            case '制衡':
                return !player.skillStates.zhihengUsed && player.handCards.length > 0;
            case '苦肉':
                return !player.skillStates.kuruUsed && player.hp > 1;
            case '反间':
                return !player.skillStates.fanjianUsed;
            case '青囊':
                return !player.skillStates.qingnangUsed && player.handCards.length > 0;
            case '仁德':
                return !player.skillStates.rendeUsed && player.handCards.length >= 2;
            case '结姻':
                return !player.skillStates.jieyinUsed && player.handCards.length >= 2;
            case '离间':
                return !player.skillStates.lijianUsed && player.handCards.length >= 1;
            case '强袭':
                return !player.skillStates.qiangxiUsed;
            case '据守':
                return !player.skillStates.jushouUsed;
            case '挑衅':
                return !player.skillStates.tiaoxinUsed;
            case '天义':
                return !player.skillStates.tianyiUsed;
            case '乱击':
                return !player.skillStates.luanjiUsed && player.handCards.length >= 2;
            default:
                return false;
        }
    }

    function renderActionBar(human, state) {
        const actionBar = document.getElementById('actionBar');
        const isMyTurn = state.currentPlayerIdx === human.id;
        
        if (isMyTurn && state.phase === 'play') {
            actionBar.innerHTML = `
                <button class="btn btn-small" onclick="SGS.UI.Board.endTurn()">结束回合</button>
            `;
        } else if (isMyTurn && state.phase === 'discard') {
            const needDiscard = human.handCards.length - human.hp;
            actionBar.innerHTML = `
                <button class="btn btn-small btn-danger" onclick="SGS.UI.Board.confirmDiscard()" 
                        id="discardBtn" disabled>弃牌(${needDiscard})</button>
            `;
            // 自动选中要弃的牌
            if (needDiscard > 0) {
                window._discardMode = true;
                window._selectedDiscard = [];
            }
        } else {
            actionBar.innerHTML = '';
        }
    }

    function updateActionPrompt(human, state) {
        const prompt = document.getElementById('actionPrompt');
        const isMyTurn = state.currentPlayerIdx === human.id;
        
        if (state.gameOver) {
            prompt.textContent = '游戏结束';
            return;
        }
        
        if (isMyTurn) {
            switch (state.phase) {
                case 'begin':
                    prompt.textContent = '回合开始...';
                    break;
                case 'judge':
                    prompt.textContent = '判定阶段...';
                    break;
                case 'draw':
                    prompt.textContent = '摸牌阶段...';
                    break;
                case 'play':
                    if (selectedCard) {
                        prompt.textContent = `已选择【${selectedCard.name}】，请选择目标`;
                    } else {
                        prompt.textContent = '出牌阶段：点击卡牌使用';
                    }
                    break;
                case 'discard':
                    const need = human.handCards.length - human.hp;
                    if (need > 0) {
                        prompt.textContent = `弃牌阶段：需弃${need}张牌`;
                    } else {
                        prompt.textContent = '弃牌阶段';
                    }
                    break;
                case 'end':
                    prompt.textContent = '回合结束...';
                    break;
            }
        } else {
            const currentPlayer = engine.players[state.currentPlayerIdx];
            if (currentPlayer) {
                prompt.textContent = `${currentPlayer.name}(${currentPlayer.hero.name})回合中...`;
            }
        }
    }

    // ========== 交互处理 ==========
    function clickCard(idx) {
        const human = engine.getHumanPlayer();
        if (!human) return;
        const state = engine.getState();
        
        // 弃牌模式
        if (state.phase === 'discard' && state.currentPlayerIdx === human.id) {
            const card = human.handCards[idx];
            const di = window._selectedDiscard.indexOf(idx);
            if (di >= 0) {
                window._selectedDiscard.splice(di, 1);
            } else {
                window._selectedDiscard.push(idx);
            }
            // 更新选中状态
            document.querySelectorAll('#handCards .card').forEach((el, i) => {
                el.classList.toggle('selected', window._selectedDiscard.includes(i));
            });
            // 更新按钮
            const need = human.handCards.length - human.hp;
            const btn = document.getElementById('discardBtn');
            if (btn) {
                btn.disabled = window._selectedDiscard.length !== need;
                btn.textContent = `弃牌(${window._selectedDiscard.length}/${need})`;
            }
            return;
        }

        // 出牌模式
        if (state.phase !== 'play' || state.currentPlayerIdx !== human.id) return;
        
        const card = human.handCards[idx];
        if (!canUseCard(human, card)) return;
        
        if (selectedCard && selectedCard.instanceId === card.instanceId) {
            // 取消选择
            selectedCard = null;
        } else {
            selectedCard = card;
        }
        
        // 如果需要选择目标
        if (selectedCard) {
            const needsTarget = card.subtype === 'sha' || card.subtype === 'juedou' || 
                               card.subtype === 'guohe' || card.subtype === 'shunshou' ||
                               card.subtype === 'huogong' || card.subtype === 'jiedao' ||
                               card.subtype === 'lebusi' || card.subtype === 'bingliang' ||
                               card.subtype === 'tiesuo';
            
            if (needsTarget) {
                showTargetSelector(human, card);
            } else {
                // 不需要目标，直接使用
                useCardWithTarget(card, []);
            }
        }
        
        updateGameBoard(engine.getState());
    }

    function showTargetSelector(player, card) {
        const overlay = document.createElement('div');
        overlay.className = 'target-selector';
        overlay.id = 'targetSelector';
        
        let targets = [];
        switch (card.subtype) {
            case 'sha':
                targets = engine.getAttackTargets(player);
                break;
            case 'shunshou':
            case 'bingliang':
                targets = engine.getAlivePlayers().filter(p => p.id !== player.id && engine.getDistance(player, p) <= 1);
                break;
            case 'juedou':
            case 'guohe':
            case 'huogong':
            case 'jiedao':
                targets = engine.getAlivePlayers().filter(p => p.id !== player.id);
                break;
            case 'lebusi':
                targets = engine.getAlivePlayers().filter(p => p.id !== player.id && 
                    !p.judgmentCards.some(c => c.subtype === 'lebusi'));
                break;
            case 'tiesuo':
                targets = engine.getAlivePlayers().filter(p => p.id !== player.id);
                break;
            default:
                targets = engine.getAlivePlayers().filter(p => p.id !== player.id);
        }

        const maxTargets = card.subtype === 'tiesuo' ? 2 : 1;
        let selectedTargets = [];

        overlay.innerHTML = `
            <div class="target-selector-content">
                <div class="target-selector-title">选择目标 (${selectedTargets.length}/${maxTargets})</div>
                <div class="target-list" id="targetList">
                    ${targets.map(t => `
                        <div class="target-item" data-target-id="${t.id}" onclick="SGS.UI.Board.toggleTarget(${t.id})">
                            <span>${t.name} (${t.hero.name})</span>
                            <span style="color:var(--accent-red)">${'❤'.repeat(t.hp)}</span>
                        </div>
                    `).join('')}
                </div>
                <div style="display:flex;gap:8px;margin-top:12px;justify-content:center">
                    <button class="btn btn-small" onclick="SGS.UI.Board.cancelTargetSelect()">取消</button>
                    <button class="btn btn-small btn-primary" id="confirmTargetBtn" disabled onclick="SGS.UI.Board.confirmTarget(${maxTargets})">确认</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        window._selectedTargets = [];
        window._maxTargets = maxTargets;
    }

    function toggleTarget(targetId) {
        const idx = window._selectedTargets.indexOf(targetId);
        const item = document.querySelector(`[data-target-id="${targetId}"]`);
        if (idx >= 0) {
            window._selectedTargets.splice(idx, 1);
            item.classList.remove('selected');
        } else {
            if (window._selectedTargets.length < window._maxTargets) {
                window._selectedTargets.push(targetId);
                item.classList.add('selected');
            } else {
                // 替换
                const oldId = window._selectedTargets[window._selectedTargets.length - 1];
                const oldItem = document.querySelector(`[data-target-id="${oldId}"]`);
                if (oldItem) oldItem.classList.remove('selected');
                window._selectedTargets[window._maxTargets - 1] = targetId;
                item.classList.add('selected');
            }
        }
        // 更新标题
        const title = document.querySelector('.target-selector-title');
        if (title) title.textContent = `选择目标 (${window._selectedTargets.length}/${window._maxTargets})`;
        // 更新确认按钮
        const btn = document.getElementById('confirmTargetBtn');
        if (btn) {
            btn.disabled = window._selectedTargets.length === 0;
        }
    }

    function confirmTarget(maxTargets) {
        const targetIds = window._selectedTargets;
        cancelTargetSelect();
        if (selectedCard) {
            useCardWithTarget(selectedCard, targetIds);
            selectedCard = null;
        }
    }

    function cancelTargetSelect() {
        const overlay = document.getElementById('targetSelector');
        if (overlay) overlay.remove();
        selectedCard = null;
        updateGameBoard(engine.getState());
    }

    function useCardWithTarget(card, targetIds) {
        engine.processAction({
            type: 'useCard',
            cardId: card.instanceId,
            targetIds: targetIds,
        });
    }

    function clickPlayer(playerId) {
        // 在目标选择模式下，点击玩家选择目标
        if (document.getElementById('targetSelector')) {
            toggleTarget(playerId);
            return;
        }
        // 显示玩家详细信息
        const player = engine.players[playerId];
        if (!player) return;
        showPlayerDetail(player);
    }

    function showPlayerDetail(player) {
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.onclick = () => overlay.remove();
        overlay.innerHTML = `
            <div class="skill-modal" onclick="event.stopPropagation()">
                <h4>${player.name} - ${player.hero.name}</h4>
                <p>势力：${SGS.HeroData.factionName[player.faction] || '?'}</p>
                <p>体力：${player.hp}/${player.maxHp}</p>
                <p>手牌：${player.handCards.length}张</p>
                <p>装备：${Object.values(player.equipment).filter(e => e).map(e => e.name).join('、') || '无'}</p>
                <p style="color:var(--accent-gold)">技能：</p>
                ${player.hero.skills.map(s => `<p style="font-size:12px"><b>${s.name}</b>：${s.desc}</p>`).join('')}
                <button class="btn btn-small" onclick="this.closest('.overlay').remove()">关闭</button>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function clickSkill(skillName) {
        const human = engine.getHumanPlayer();
        if (!human) return;

        // 简化处理：各技能直接执行
        switch (skillName) {
            case '制衡':
                // 选择要弃的牌
                promptZhiheng(human);
                break;
            case '苦肉':
                engine.useSkill(human, '苦肉', {});
                break;
            case '反间':
                promptSelectTarget(human, '反间', 1, (targetIds) => {
                    engine.useSkill(human, '反间', { targetId: targetIds[0] });
                });
                break;
            case '青囊':
                promptSelectTarget(human, '青囊', 1, (targetIds) => {
                    engine.useSkill(human, '青囊', { targetId: targetIds[0], card: human.handCards[0] });
                });
                break;
            case '仁德':
                promptSelectTarget(human, '仁德', 1, (targetIds) => {
                    // 简化：给2张牌
                    const cards = human.handCards.slice(0, 2);
                    engine.useSkill(human, '仁德', { targetId: targetIds[0], cards });
                });
                break;
            case '结姻':
                promptSelectTarget(human, '结姻', 1, (targetIds) => {
                    const cards = human.handCards.slice(0, 2);
                    engine.useSkill(human, '结姻', { targetId: targetIds[0], cards });
                });
                break;
            case '离间':
                promptSelectTarget(human, '离间', 2, (targetIds) => {
                    engine.useSkill(human, '离间', { targetId: targetIds[0], targetId2: targetIds[1], card: human.handCards[0] });
                });
                break;
            case '强袭':
                promptSelectTarget(human, '强袭', 1, (targetIds) => {
                    engine.useSkill(human, '强袭', { targetId: targetIds[0] });
                });
                break;
            case '据守':
                engine.useSkill(human, '据守', {});
                break;
            case '挑衅':
                promptSelectTarget(human, '挑衅', 1, (targetIds) => {
                    engine.useSkill(human, '挑衅', { targetId: targetIds[0] });
                });
                break;
            case '天义':
                promptSelectTarget(human, '天义', 1, (targetIds) => {
                    engine.useSkill(human, '天义', { targetId: targetIds[0] });
                });
                break;
        }
        updateGameBoard(engine.getState());
    }

    function promptZhiheng(player) {
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML = `
            <div class="skill-modal" style="max-height:80%;overflow-y:auto">
                <h4>制衡：选择要弃的牌</h4>
                <div class="hand-cards" id="zhihengCards" style="flex-wrap:wrap;justify-content:center">
                    ${player.handCards.map((c, i) => `
                        <div class="card ${SGS.CardData.suitColor[c.suit]}" data-idx="${i}" onclick="this.classList.toggle('selected')">
                            <span class="card-suit">${SGS.CardData.suitName[c.suit]}</span>
                            <span class="card-name">${c.name}</span>
                        </div>
                    `).join('')}
                </div>
                <div style="display:flex;gap:8px;margin-top:12px;justify-content:center">
                    <button class="btn btn-small" onclick="this.closest('.overlay').remove()">取消</button>
                    <button class="btn btn-small btn-primary" id="zhihengConfirm" onclick="SGS.UI.Board.confirmZhiheng()">确认</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function confirmZhiheng() {
        const selected = document.querySelectorAll('#zhihengCards .card.selected');
        const human = engine.getHumanPlayer();
        const cards = Array.from(selected).map(el => human.handCards[parseInt(el.dataset.idx)]);
        if (cards.length > 0) {
            engine.useSkill(human, '制衡', { cards });
        }
        document.querySelector('.overlay').remove();
        updateGameBoard(engine.getState());
    }

    function promptSelectTarget(player, skillName, maxTargets, callback) {
        const overlay = document.createElement('div');
        overlay.className = 'target-selector';
        let selected = [];
        
        const targets = engine.getAlivePlayers().filter(p => {
            if (skillName === '结姻') return p.gender === 'male' && p.id !== player.id && p.hp < p.maxHp;
            if (skillName === '离间') return p.gender === 'male' && p.id !== player.id;
            if (skillName === '青囊') return p.hp < p.maxHp;
            return p.id !== player.id;
        });

        overlay.innerHTML = `
            <div class="target-selector-content">
                <div class="target-selector-title">${skillName}：选择目标 (${selected.length}/${maxTargets})</div>
                <div class="target-list" id="skillTargetList">
                    ${targets.map(t => `
                        <div class="target-item" data-id="${t.id}">
                            <span>${t.name}(${t.hero.name})</span>
                            <span style="color:var(--accent-red)">${'❤'.repeat(t.hp)}</span>
                        </div>
                    `).join('')}
                </div>
                <div style="display:flex;gap:8px;margin-top:12px;justify-content:center">
                    <button class="btn btn-small" onclick="this.closest('.target-selector').remove()">取消</button>
                    <button class="btn btn-small btn-primary" id="skillTargetConfirm" disabled>确认</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelectorAll('.target-item').forEach(item => {
            item.onclick = () => {
                const id = parseInt(item.dataset.id);
                const idx = selected.indexOf(id);
                if (idx >= 0) {
                    selected.splice(idx, 1);
                    item.classList.remove('selected');
                } else if (selected.length < maxTargets) {
                    selected.push(id);
                    item.classList.add('selected');
                }
                overlay.querySelector('.target-selector-title').textContent = 
                    `${skillName}：选择目标 (${selected.length}/${maxTargets})`;
                overlay.querySelector('#skillTargetConfirm').disabled = selected.length !== maxTargets;
            };
        });

        overlay.querySelector('#skillTargetConfirm').onclick = () => {
            callback(selected);
            overlay.remove();
        };
    }

    function endTurn() {
        const human = engine.getHumanPlayer();
        engine.processAction({ type: 'endTurn' });
    }

    function confirmDiscard() {
        const human = engine.getHumanPlayer();
        const indices = window._selectedDiscard || [];
        const cards = indices.map(i => human.handCards[i]).filter(c => c);
        engine.processAction({ type: 'discard', cards });
        window._selectedDiscard = [];
        window._discardMode = false;
    }

    // ========== 出牌动画 ==========
    let cardAnimationId = 0;
    const activeAnimations = new Set();
    
    function showCardAnimation(card, fromId, targetIds, duration = 2500) {
        const cardId = ++cardAnimationId;
        
        // 如果有相同类型的动画正在播放，先让它快速淡出
        const sameTypeAnim = [...activeAnimations].find(id => {
            const el = document.getElementById('cardAnim_' + id);
            return el && el.dataset.cardType === card.type;
        });
        
        if (sameTypeAnim) {
            const oldEl = document.getElementById('cardAnim_' + sameTypeAnim);
            if (oldEl) {
                oldEl.style.transition = 'opacity 0.3s, transform 0.3s';
                oldEl.style.opacity = '0';
                oldEl.style.transform = 'translate(-50%, -50%) scale(0.5)';
                setTimeout(() => {
                    oldEl.remove();
                    activeAnimations.delete(sameTypeAnim);
                }, 300);
            }
        }
        
        // 创建动画元素
        const overlay = document.createElement('div');
        overlay.id = 'cardAnim_' + cardId;
        overlay.className = 'card-animation';
        overlay.dataset.cardType = card.type;
        
        const suit = card.suit || 'spade';
        const colorClass = SGS.CardData ? SGS.CardData.suitColor[suit] : 'black';
        const elementClass = card.element === 'fire' ? 'fire' : card.element === 'thunder' ? 'thunder' : '';
        const nameDisplay = elementClass ? `${card.element === 'fire' ? '火' : '雷'}${card.name}` : card.name;
        
        overlay.innerHTML = `
            <div class="card ${colorClass} ${elementClass} anim-card">
                <span class="card-name">${nameDisplay}</span>
                <span class="card-type">${card.type === 'basic' ? '基本' : card.type === 'trick' ? '锦囊' : '装备'}</span>
            </div>
        `;
        
        // 定位到出牌玩家位置
        const fromPlayer = engine.players[fromId];
        const targetPlayer = targetIds && targetIds.length > 0 ? engine.players[targetIds[0]] : null;
        
        if (fromPlayer && fromPlayer.id === engine.getHumanPlayer()?.id) {
            // 是自己出牌，显示在手牌区域上方
            const handEl = document.getElementById('handCards');
            if (handEl) {
                const rect = handEl.getBoundingClientRect();
                overlay.style.left = (rect.left + rect.width / 2) + 'px';
                overlay.style.top = (rect.top - 80) + 'px';
            }
        } else if (fromPlayer) {
            // 其他玩家出牌，显示在对应玩家位置
            const playerMini = document.querySelector(`.player-mini[data-player-id="${fromPlayer.id}"]`);
            if (playerMini) {
                const rect = playerMini.getBoundingClientRect();
                overlay.style.left = (rect.left + rect.width / 2) + 'px';
                overlay.style.top = (rect.top + rect.height / 2) + 'px';
            } else {
                overlay.style.left = '50%';
                overlay.style.top = '30%';
            }
        } else {
            overlay.style.left = '50%';
            overlay.style.top = '30%';
        }
        
        document.body.appendChild(overlay);
        activeAnimations.add(cardId);
        
        // 动画结束后移除
        setTimeout(() => {
            overlay.style.transition = 'opacity 0.8s, transform 0.8s';
            overlay.style.opacity = '0';
            overlay.style.transform = 'translate(-50%, -50%) scale(0.3) rotate(15deg)';
            setTimeout(() => {
                overlay.remove();
                activeAnimations.delete(cardId);
            }, 800);
        }, duration);
    }
    
    // ========== 卡牌选择器 ==========
    let cardSelectorOverlay = null;
    
    function showCardSelector(cards, promptText, hideInfo, onSelect) {
        // 移除已有的选择器
        const existing = document.getElementById('cardSelectorOverlay');
        if (existing) existing.remove();
        
        cardSelectorOverlay = document.createElement('div');
        cardSelectorOverlay.id = 'cardSelectorOverlay';
        cardSelectorOverlay.className = 'overlay';
        cardSelectorOverlay.innerHTML = `
            <div class="card-selector-modal" style="max-width:90%;max-height:85%;overflow:auto;">
                <div style="color:var(--accent-gold);font-size:1.4vw;font-weight:bold;text-align:center;margin-bottom:1.2vw;padding:1.2vw;">${promptText}</div>
                <div id="cardSelectorList" style="display:flex;gap:1vw;flex-wrap:wrap;justify-content:center;padding:1vw;min-height:10vw;">
                    ${cards.map(c => {
                        const suitChar = SGS.CardData.suitName[c.suit];
                        const colorClass = SGS.CardData.suitColor[c.suit];
                        const elementClass = c.element === 'fire' ? 'fire' : c.element === 'thunder' ? 'thunder' : '';
                        const nameDisplay = elementClass ? `${c.element === 'fire' ? '火' : '雷'}${c.name}` : c.name;
                        
                        if (hideInfo) {
                            // 对手牌：显示卡牌背面
                            return `<div class="card card-back card-selector-item" data-id="${c.instanceId}" onclick="SGS.UI.Board.selectCardFromList('${c.instanceId}')" style="width:7vw;height:10vh;cursor:pointer;">
                                <div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:4vw;">🂠</div>
                            </div>`;
                        } else {
                            return `<div class="card ${colorClass} ${elementClass} card-selector-item" data-id="${c.instanceId}" onclick="SGS.UI.Board.selectCardFromList('${c.instanceId}')" style="width:7vw;height:10vh;cursor:pointer;">
                                <span class="card-suit ${colorClass}">${suitChar}</span>
                                <span class="card-name">${nameDisplay}</span>
                            </div>`;
                        }
                    }).join('')}
                </div>
                <div style="text-align:center;margin-top:1vw;">
                    <button class="btn btn-small" onclick="SGS.UI.Board.cancelCardSelector()">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(cardSelectorOverlay);
    }
    
    function selectCardFromList(cardId) {
        if (engine && engine._pendingCardChoice) {
            const pc = engine._pendingCardChoice;
            const chosen = pc.cards.find(c => c.instanceId === cardId);
            if (chosen) {
                pc.resolve(chosen);
            }
            // 移除选择器
            if (cardSelectorOverlay) {
                cardSelectorOverlay.remove();
                cardSelectorOverlay = null;
            }
        }
    }
    
    function cancelCardSelector() {
        if (engine && engine._pendingCardChoice) {
            const pc = engine._pendingCardChoice;
            pc.resolve(null);
        }
        if (cardSelectorOverlay) {
            cardSelectorOverlay.remove();
            cardSelectorOverlay = null;
        }
    }
    
    // ========== 事件处理 ==========
    function handleGameEvent(event) {
        if (event.type === 'log') {
            appendLog(event.msg, event.type === 'log' ? event._type || 'normal' : 'normal');
        } else if (event.type === 'cardUsed') {
            // 显示出牌动画
            showCardAnimation(event.detail.card, event.detail.fromId, event.detail.targetIds, 2500);
        } else if (event.type === 'needDiscard') {
            // 已在updateGameBoard中处理
        }
    }

    function appendLog(msg, type = 'normal') {
        const logEl = document.getElementById('gameLog');
        if (!logEl) return;
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = msg;
        logEl.appendChild(entry);
        logEl.scrollTop = logEl.scrollHeight;
        // 限制日志条数
        while (logEl.children.length > 50) {
            logEl.removeChild(logEl.firstChild);
        }
    }

    function handleChoiceRequest(choiceRequest) {
        // 处理需要玩家选择的请求（如无懈可击询问等）
        return null;
    }

    // ========== 游戏结束 ==========
    function showGameOver(result) {
        const el = document.getElementById('gameOverScreen');
        const human = engine.getHumanPlayer();
        let isWin = false;
        
        if (result.winner) {
            if (config.mode === 'national') {
                isWin = result.winner.includes(human.id.toString()) || 
                        (human.heroRevealed && result.winner.includes(human.faction));
            } else {
                isWin = result.winner.includes(human.identity);
            }
        }

        el.innerHTML = `
            <div class="gameover-title ${isWin ? 'win' : 'lose'}">
                ${isWin ? '胜利！' : '失败...'}
            </div>
            <div class="gameover-info">
                ${config.mode === 'national' ? 
                    (result.winner && result.winner.length === 1 && result.winner[0].startsWith ? '野心家获胜' :
                     result.winner ? `${SGS.HeroData.factionName[result.winner[0]] || ''}势力获胜` : '') :
                    result.winner ? `${SGS.Config.identityName[result.winner[0]] || result.winner[0]}方获胜` : ''}
            </div>
            <div class="identity-reveal">
                ${result.players.map(p => `
                    <div class="identity-row">
                        <span>${p.name} (${p.hero})</span>
                        <span class="identity-tag ${p.identity}">${SGS.Config.identityName[p.identity] || ''}</span>
                    </div>
                `).join('')}
            </div>
            <div style="display:flex;gap:12px">
                <button class="btn" onclick="SGS.UI.Board.quitToMenu()">返回主菜单</button>
                <button class="btn btn-primary" onclick="SGS.UI.Board.restart()">再来一局</button>
            </div>
        `;
        
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        el.classList.add('active');
    }

    function quitToMenu() {
        gameStarted = false;
        engine = null;
        adapter = null;
        SGS.UI.Menu.init();
    }

    function restart() {
        gameStarted = false;
        const cfg = { ...config };
        initGame(cfg);
    }

    function confirmQuit() {
        if (confirm('确定退出当前对局吗？')) {
            quitToMenu();
        }
    }

    function toggleLog() {
        const log = document.getElementById('gameLog');
        if (log) {
            log.style.display = log.style.display === 'none' ? 'block' : 'none';
        }
    }

    return {
        initGame, startGame, selectHero, confirmHeroSelection,
        clickCard, clickPlayer, clickSkill,
        toggleTarget, confirmTarget, cancelTargetSelect,
        endTurn, confirmDiscard,
        quitToMenu, restart, confirmQuit, toggleLog,
        promptZhiheng, confirmZhiheng,
        renderBanScreen: null,
    };
})();
