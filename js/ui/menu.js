/**
 * 三国杀UI - 菜单与设置界面
 */
var SGS = window.SGS = window.SGS || {};

SGS.UI = SGS.UI || {};

SGS.UI.Menu = (function() {

    let currentConfig = {
        mode: 'standard',
        playerCount: 8,
        pickMode: 'random',
        includeMilitary: true,
        bannedHeroes: [],
        bannedCards: [],
        selectedHeroes: {}, // playerIdx -> heroId
    };

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    }

    // ========== 主菜单 ==========
    function renderMainMenu() {
        const el = document.getElementById('mainMenu');
        el.innerHTML = `
            <div class="menu-title">三国杀</div>
            <div class="menu-subtitle">群雄逐鹿</div>
            <div class="menu-buttons">
                <button class="btn btn-large btn-primary" onclick="SGS.UI.Menu.startSetup()">开始游戏</button>
                <button class="btn btn-large" onclick="SGS.UI.Menu.showRules()">规则说明</button>
                <button class="btn btn-large" onclick="SGS.UI.Menu.showAbout()">关于</button>
            </div>
            <div class="menu-version">单机版 v1.0 · 预留联机接口</div>
        `;
    }

    // ========== 建房设置 ==========
    function startSetup() {
        currentConfig = {
            mode: 'standard',
            playerCount: 8,
            pickMode: 'random',
            includeMilitary: true,
            bannedHeroes: [],
            bannedCards: [],
            selectedHeroes: {},
        };
        renderSetupScreen();
        showScreen('setupScreen');
    }

    function renderSetupScreen() {
        const el = document.getElementById('setupScreen');
        const modes = SGS.Config.MODES;
        const isNational = currentConfig.mode === 'national';
        
        el.innerHTML = `
            <div class="setup-header">
                <button class="btn btn-small" onclick="SGS.UI.Menu.backToMain()">返回</button>
                <h2>创建对局</h2>
                <div style="width:60px"></div>
            </div>

            <div class="setup-section">
                <div class="setup-section-title">游戏模式</div>
                <div class="option-grid">
                    ${Object.values(modes).map(mode => `
                        <div class="option-item ${currentConfig.mode === mode ? 'active' : ''}" 
                             onclick="SGS.UI.Menu.selectMode('${mode}')">
                            ${SGS.Config.modeName[mode]}
                        </div>
                    `).join('')}
                </div>
                <p style="font-size:12px;color:var(--text-secondary);margin-top:6px">${SGS.Config.modeDesc[currentConfig.mode]}</p>
            </div>

            <div class="setup-section">
                <div class="setup-section-title">玩家人数</div>
                <div class="option-grid">
                    ${isNational 
                        ? [4,5,6,7,8].map(n => `
                            <div class="option-item ${currentConfig.playerCount === n ? 'active' : ''}"
                                 onclick="SGS.UI.Menu.selectPlayerCount(${n})">${n}人</div>
                        `).join('')
                        : [2,3,4,5,6,7,8,9,10].map(n => `
                            <div class="option-item ${currentConfig.playerCount === n ? 'active' : ''}"
                                 onclick="SGS.UI.Menu.selectPlayerCount(${n})">${n}人</div>
                        `).join('')
                    }
                </div>
            </div>

            <div class="setup-section">
                <div class="setup-section-title">选将方式</div>
                <div class="option-grid">
                    <div class="option-item ${currentConfig.pickMode === 'random' ? 'active' : ''}"
                         onclick="SGS.UI.Menu.selectPickMode('random')">${SGS.Config.pickModeName.random}</div>
                    <div class="option-item ${currentConfig.pickMode === 'free' ? 'active' : ''}"
                         onclick="SGS.UI.Menu.selectPickMode('free')">${SGS.Config.pickModeName.free}</div>
                </div>
                <p style="font-size:12px;color:var(--text-secondary);margin-top:6px">
                    ${currentConfig.pickMode === 'random' ? '每人随机获得若干武将供选择' : '从全武将池自由选择'}
                </p>
            </div>

            ${!isNational ? `
            <div class="setup-section">
                <div class="setup-section-title">卡牌扩展</div>
                <div class="toggle-row">
                    <span class="toggle-label">包含军争篇卡牌</span>
                    <div class="toggle-switch ${currentConfig.includeMilitary ? 'on' : ''}" 
                         onclick="SGS.UI.Menu.toggleMilitary()"></div>
                </div>
            </div>
            ` : ''}

            <div class="setup-section">
                <div class="setup-section-title">Ban设置</div>
                <p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">
                    选择本局禁用的武将和卡牌
                </p>
                <button class="btn btn-small" onclick="SGS.UI.Menu.openBanScreen()">
                    ${currentConfig.bannedHeroes.length + currentConfig.bannedCards.length > 0 
                        ? `已Ban ${currentConfig.bannedHeroes.length}将 ${currentConfig.bannedCards.length}牌` 
                        : '前往Ban选'}
                </button>
            </div>

            <div class="setup-section">
                <div class="setup-section-title">对手设置</div>
                <p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">
                    单机模式：除你之外均为AI对手<br>
                    <span style="color:var(--accent-gold)">联机模式（开发中）：可邀请好友加入</span>
                </p>
            </div>

            <div class="setup-footer">
                <button class="btn btn-primary btn-large" onclick="SGS.UI.Menu.proceedToHeroSelect()">
                    确认设置
                </button>
            </div>
        `;
    }

    function selectMode(mode) {
        currentConfig.mode = mode;
        if (mode === 'national' && currentConfig.playerCount < 4) {
            currentConfig.playerCount = 4;
        }
        if (mode === 'national') {
            currentConfig.includeMilitary = true;
        }
        renderSetupScreen();
    }

    function selectPlayerCount(n) {
        currentConfig.playerCount = n;
        renderSetupScreen();
    }

    function selectPickMode(mode) {
        currentConfig.pickMode = mode;
        renderSetupScreen();
    }

    function toggleMilitary() {
        currentConfig.includeMilitary = !currentConfig.includeMilitary;
        renderSetupScreen();
    }

    // ========== Ban界面 ==========
    function openBanScreen() {
        renderBanScreen('hero');
        showScreen('banScreen');
    }

    let banTab = 'hero';

    function renderBanScreen(tab) {
        banTab = tab;
        const el = document.getElementById('banScreen');
        const heroes = SGS.HeroData.getAll();
        const cards = SGS.CardData.allCards;
        // 去重卡牌名
        const uniqueCardNames = [...new Set(cards.map(c => c.subtype))];
        const cardNames = uniqueCardNames.map(subtype => {
            const card = cards.find(c => c.subtype === subtype);
            return { subtype, name: card.name, desc: card.desc || '' };
        });

        el.innerHTML = `
            <div class="setup-header">
                <button class="btn btn-small" onclick="SGS.UI.Menu.backToSetup()">返回</button>
                <h2>Ban设置</h2>
                <div style="width:60px"></div>
            </div>

            <div class="ban-tabs">
                <div class="ban-tab ${tab === 'hero' ? 'active' : ''}" onclick="SGS.UI.Menu.renderBanScreen('hero')">禁武将</div>
                <div class="ban-tab ${tab === 'card' ? 'active' : ''}" onclick="SGS.UI.Menu.renderBanScreen('card')">禁卡牌</div>
            </div>

            ${tab === 'hero' ? `
                <p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">
                    已禁用 ${currentConfig.bannedHeroes.length} 个武将
                </p>
                <div class="hero-grid">
                    ${heroes.map(h => `
                        <div class="hero-card ${currentConfig.bannedHeroes.includes(h.id) ? 'selected' : ''}"
                             onclick="SGS.UI.Menu.toggleBanHero('${h.id}')">
                            <div class="hero-name">${h.name}</div>
                            <div class="hero-faction ${h.faction}">${SGS.HeroData.factionName[h.faction]}</div>
                            <div class="hero-hp">${h.maxHp}血</div>
                            <div class="hero-skills">${h.skills.map(s => s.name).join(' ')}</div>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">
                    已禁用 ${currentConfig.bannedCards.length} 种卡牌
                </p>
                <div class="hero-grid">
                    ${cardNames.map(c => `
                        <div class="hero-card ${currentConfig.bannedCards.includes(c.subtype) ? 'selected' : ''}"
                             onclick="SGS.UI.Menu.toggleBanCard('${c.subtype}')">
                            <div class="hero-name">${c.name}</div>
                            <div class="hero-skills">${c.desc.substring(0, 30)}</div>
                        </div>
                    `).join('')}
                </div>
            `}

            <div class="setup-footer">
                <button class="btn btn-primary" onclick="SGS.UI.Menu.backToSetup()">完成</button>
            </div>
        `;
        showScreen('banScreen');
    }

    function toggleBanHero(heroId) {
        const idx = currentConfig.bannedHeroes.indexOf(heroId);
        if (idx >= 0) {
            currentConfig.bannedHeroes.splice(idx, 1);
        } else {
            currentConfig.bannedHeroes.push(heroId);
        }
        renderBanScreen('hero');
    }

    function toggleBanCard(subtype) {
        const idx = currentConfig.bannedCards.indexOf(subtype);
        if (idx >= 0) {
            currentConfig.bannedCards.splice(idx, 1);
        } else {
            currentConfig.bannedCards.push(subtype);
        }
        renderBanScreen('card');
    }

    // ========== 选将界面 ==========
    function proceedToHeroSelect() {
        SGS.UI.Board.initGame(currentConfig);
    }

    function backToMain() {
        renderMainMenu();
        showScreen('mainMenu');
    }

    function backToSetup() {
        renderSetupScreen();
        showScreen('setupScreen');
    }

    // ========== 规则说明 ==========
    function showRules() {
        const el = document.getElementById('rulesScreen');
        el.innerHTML = `
            <div class="setup-header">
                <button class="btn btn-small" onclick="SGS.UI.Menu.backToMain()">返回</button>
                <h2>规则说明</h2>
                <div style="width:60px"></div>
            </div>
            <div class="rules-content">
                <h3>游戏概述</h3>
                <p>三国杀是一款以三国时期为背景的策略卡牌桌游。玩家扮演三国武将，通过出牌和技能击败对手。</p>
                
                <h3>身份局（标准/军争）</h3>
                <p>玩家分为四种身份：</p>
                <ul>
                    <li><b>主公</b>：公开身份，需消灭所有反贼和内奸</li>
                    <li><b>忠臣</b>：保护主公，消灭反贼和内奸</li>
                    <li><b>反贼</b>：消灭主公</li>
                    <li><b>内奸</b>：成为最后的幸存者</li>
                </ul>
                <p>军争模式在标准版基础上增加军争篇卡牌（火杀、雷杀、酒、铁索连环等），节奏更快。</p>

                <h3>国战模式</h3>
                <p>每人选择两张同势力武将（主将+副将），开局暗置。</p>
                <ul>
                    <li>体力上限 = 两将阴阳鱼之和取整</li>
                    <li>暗将无技能、无势力、无性别</li>
                    <li>回合开始或发动技能时可亮将</li>
                    <li>同势力超过半数时后续亮将者变为野心家</li>
                    <li>胜利条件：消灭所有不同势力角色</li>
                </ul>

                <h3>回合流程</h3>
                <p>每回合分为六个阶段：</p>
                <ul>
                    <li><b>回合开始</b>：可发动回合开始技能（观星、洛神等）</li>
                    <li><b>判定阶段</b>：依次结算判定区的延时锦囊</li>
                    <li><b>摸牌阶段</b>：从牌堆摸2张牌</li>
                    <li><b>出牌阶段</b>：使用手牌（每回合限1张杀）</li>
                    <li><b>弃牌阶段</b>：手牌数不超过当前体力值</li>
                    <li><b>回合结束</b>：可发动结束技能</li>
                </ul>

                <h3>基本牌</h3>
                <ul>
                    <li><b>杀</b>：对攻击范围内一名角色造成1点伤害（每回合1次）</li>
                    <li><b>闪</b>：抵消一次【杀】的攻击</li>
                    <li><b>桃</b>：回复1点体力（自己使用）或救人</li>
                    <li><b>酒</b>：令下一张杀+1伤害，或濒死时自救</li>
                </ul>

                <h3>军争新增</h3>
                <ul>
                    <li><b>火杀/雷杀</b>：造成属性伤害，可触发铁索连环</li>
                    <li><b>铁索连环</b>：横置角色，属性伤害可传导</li>
                    <li><b>火攻</b>：弃同花色牌造成火焰伤害</li>
                    <li><b>兵粮寸断</b>：跳过目标摸牌阶段</li>
                </ul>

                <h3>装备牌</h3>
                <ul>
                    <li><b>武器</b>：增加攻击距离，附带武器技能</li>
                    <li><b>防具</b>：提供防御效果</li>
                    <li><b>+1马</b>：其他角色与你距离+1</li>
                    <li><b>-1马</b>：你与其他角色距离-1</li>
                </ul>

                <h3>距离计算</h3>
                <p>玩家按圆形排列，距离为最短路径。装备坐骑可改变距离。攻击范围由武器决定。</p>

                <h3>操作提示</h3>
                <ul>
                    <li>点击手牌选择卡牌，再点击目标使用</li>
                    <li>绿色边框表示当前可使用的卡牌</li>
                    <li>底部按钮可结束回合或使用技能</li>
                </ul>
            </div>
        `;
        showScreen('rulesScreen');
    }

    function showAbout() {
        const el = document.getElementById('rulesScreen');
        el.innerHTML = `
            <div class="setup-header">
                <button class="btn btn-small" onclick="SGS.UI.Menu.backToMain()">返回</button>
                <h2>关于</h2>
                <div style="width:60px"></div>
            </div>
            <div class="rules-content">
                <h3>三国杀单机版</h3>
                <p>版本：v1.0</p>
                <p>一个完整的三国杀本地游玩程序，支持移动端。</p>
                
                <h3>功能特性</h3>
                <ul>
                    <li>标准身份局、军争局、国战三种模式</li>
                    <li>2-10人游戏，支持不同人数</li>
                    <li>随机选将/自由选将两种模式</li>
                    <li>Ban武将和卡牌功能</li>
                    <li>智能AI对手</li>
                    <li>完整牌组（标准+军争共160张）</li>
                    <li>40+武将（标准+风火林山）</li>
                </ul>

                <h3>联机模式（开发中）</h3>
                <p>已预留联机架构：</p>
                <ul>
                    <li>网络抽象层（单机/联机无缝切换）</li>
                    <li>WebSocket通信预留</li>
                    <li>房间系统设计</li>
                </ul>
                <p>未来可通过私聊邀请好友加入房间对战。</p>

                <h3>技术架构</h3>
                <ul>
                    <li>纯HTML/CSS/JS，无需构建</li>
                    <li>移动端响应式设计</li>
                    <li>可打包为APK（通过Capacitor）</li>
                </ul>
            </div>
        `;
        showScreen('rulesScreen');
    }

    function getConfig() {
        return currentConfig;
    }

    function init() {
        renderMainMenu();
    }

    return {
        init, renderMainMenu, startSetup,
        selectMode, selectPlayerCount, selectPickMode, toggleMilitary,
        openBanScreen, renderBanScreen, toggleBanHero, toggleBanCard,
        proceedToHeroSelect, backToMain, backToSetup,
        showRules, showAbout,
        getConfig,
    };
})();
