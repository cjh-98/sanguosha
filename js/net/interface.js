/**
 * 网络接口抽象层
 * 这是单机/联机切换的关键：游戏引擎只通过此接口通信
 * 单机模式: LocalAdapter - 所有逻辑在本地运行
 * 联机模式: OnlineAdapter - 将操作发送到服务器（预留）
 *
 * 架构设计：
 * GameEngine -> NetworkInterface -> [LocalAdapter | OnlineAdapter]
 * 游戏引擎不关心是单机还是联机，只调用接口方法
 */
var SGS = window.SGS = window.SGS || {};

SGS.Net = (function() {

    /**
     * 抽象网络接口
     * 定义了游戏引擎与外部通信的标准接口
     */
    class NetworkInterface {
        constructor() {
            this.mode = 'unknown';
        }

        // 发送玩家动作
        // action: { type, cardId, targetIds, skillName, ... }
        async sendAction(action) {
            throw new Error('sendAction not implemented');
        }

        // 请求玩家选择（如选择目标、选择卡牌等）
        // 返回 Promise，resolve 为玩家选择结果
        async requestChoice(choiceRequest) {
            throw new Error('requestChoice not implemented');
        }

        // 通知游戏状态更新
        notifyState(state) {
            throw new Error('notifyState not implemented');
        }

        // 通知游戏事件（日志）
        notifyEvent(event) {
            throw new Error('notifyEvent not implemented');
        }

        // 通知游戏结束
        notifyGameOver(result) {
            throw new Error('notifyGameOver not implemented');
        }

        // 获取连接状态
        isConnected() {
            return false;
        }
    }

    /**
     * 本地适配器（单机模式）
     * 所有游戏逻辑在本地运行，AI由本地处理
     */
    class LocalAdapter extends NetworkInterface {
        constructor(gameEngine) {
            super();
            this.mode = 'local';
            this.engine = gameEngine;
            this.uiCallbacks = null;
            this.pendingChoice = null;
        }

        setUICallbacks(callbacks) {
            this.uiCallbacks = callbacks;
        }

        async sendAction(action) {
            // 本地模式直接交给引擎处理
            return this.engine.processAction(action);
        }

        async requestChoice(choiceRequest) {
            // 单机模式：如果是人类玩家，通过UI获取选择；AI则自动决策
            const player = this.engine.getCurrentActor();
            if (player && player.isAI) {
                return this.engine.ai.makeChoice(player, choiceRequest);
            }
            // 人类玩家：通过UI回调获取选择
            if (this.uiCallbacks && this.uiCallbacks.onChoice) {
                return await this.uiCallbacks.onChoice(choiceRequest);
            }
            return null;
        }

        notifyState(state) {
            if (this.uiCallbacks && this.uiCallbacks.onStateChange) {
                this.uiCallbacks.onStateChange(state);
            }
        }

        notifyEvent(event) {
            if (this.uiCallbacks && this.uiCallbacks.onEvent) {
                this.uiCallbacks.onEvent(event);
            }
        }

        notifyGameOver(result) {
            if (this.uiCallbacks && this.uiCallbacks.onGameOver) {
                this.uiCallbacks.onGameOver(result);
            }
        }

        isConnected() {
            return true; // 单机始终"已连接"
        }
    }

    /**
     * 在线适配器（联机模式 - 预留）
     * 将通过 WebSocket 与服务器通信
     * 服务器负责验证操作合法性、同步状态
     *
     * 联机架构设计：
     * 1. 房主创建房间，其他玩家通过邀请码加入
     * 2. 服务器运行权威游戏引擎，客户端只负责显示
     * 3. 玩家操作发送到服务器，服务器验证后广播状态更新
     * 4. 防作弊：所有卡牌随机性由服务器控制
     *
     * 未来实现要点：
     * - WebSocket 连接管理
     * - 房间系统（创建/加入/离开）
     * - 操作同步与冲突解决
     * - 断线重连
     */
    class OnlineAdapter extends NetworkInterface {
        constructor(serverUrl) {
            super();
            this.mode = 'online';
            this.serverUrl = serverUrl;
            this.ws = null;
            this.roomCode = null;
            this.playerId = null;
            this.callbacks = null;
            this.pendingChoices = new Map();
        }

        // 连接服务器
        async connect() {
            // TODO: 实现 WebSocket 连接
            // this.ws = new WebSocket(this.serverUrl);
            // 设置消息处理器
            throw new Error('联机模式尚未实现，当前为单机版本');
        }

        // 创建房间
        async createRoom(config) {
            // TODO: 发送创建房间请求
            // const msg = { type: 'createRoom', config };
            // this.ws.send(JSON.stringify(msg));
            throw new Error('联机模式尚未实现');
        }

        // 加入房间
        async joinRoom(roomCode) {
            // TODO: 发送加入房间请求
            throw new Error('联机模式尚未实现');
        }

        async sendAction(action) {
            // TODO: 将操作发送到服务器
            // this.ws.send(JSON.stringify({ type: 'action', action }));
            throw new Error('联机模式尚未实现');
        }

        async requestChoice(choiceRequest) {
            // TODO: 等待服务器返回选择结果
            // 或本地UI选择后发送到服务器验证
            throw new Error('联机模式尚未实现');
        }

        notifyState(state) {
            // 联机模式状态由服务器推送，这里不需要主动通知
        }

        notifyEvent(event) {
            // 联机模式事件由服务器推送
        }

        notifyGameOver(result) {
            // 联机模式游戏结束由服务器推送
        }

        isConnected() {
            return this.ws && this.ws.readyState === WebSocket.OPEN;
        }

        // 消息处理（预留）
        handleMessage(msg) {
            switch (msg.type) {
                case 'stateUpdate':
                    if (this.callbacks && this.callbacks.onStateChange) {
                        this.callbacks.onStateChange(msg.state);
                    }
                    break;
                case 'event':
                    if (this.callbacks && this.callbacks.onEvent) {
                        this.callbacks.onEvent(msg.event);
                    }
                    break;
                case 'choiceRequest':
                    // 服务器请求本玩家做选择
                    break;
                case 'gameOver':
                    if (this.callbacks && this.callbacks.onGameOver) {
                        this.callbacks.onGameOver(msg.result);
                    }
                    break;
            }
        }

        setCallbacks(callbacks) {
            this.callbacks = callbacks;
        }
    }

    return {
        NetworkInterface,
        LocalAdapter,
        OnlineAdapter,
    };
})();
