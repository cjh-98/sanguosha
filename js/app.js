/**
 * 三国杀 - 应用入口
 */
const SGS = window.SGS || (window.SGS = {});

// 应用启动
(function() {
    // 等待DOM加载完成
    function init() {
        // 初始化主菜单
        SGS.UI.Menu.init();
        
        // 阻止移动端双击缩放
        let lastTouch = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouch < 300) {
                e.preventDefault();
            }
            lastTouch = now;
        }, { passive: false });

        // 阻止下拉刷新
        document.addEventListener('touchmove', (e) => {
            if (e.target.closest('.screen') && !e.target.closest('.game-log')) {
                // 允许游戏日志滚动
                const screen = e.target.closest('.screen');
                if (screen && screen.scrollHeight > screen.clientHeight) {
                    // 允许滚动
                } else {
                    e.preventDefault();
                }
            }
        }, { passive: false });

        console.log('三国杀单机版 v1.0 已启动');
        console.log('支持模式：身份局、军争局、国战');
        console.log('联机模式：已预留接口（开发中）');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
