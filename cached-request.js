exports.cachedRequest = class {
    constructor(delay, retriever) {
        this.cache = false;
        this.time = false;
        this.delay = delay;
        this.retriever = retriever;
    }
    async get() {
        let flag = false;
        if (this.time) {
            try {
                let curTime = new Date();
                let timeDiff = curTime - this.time;
                timeDiff /= 1000;
                let seconds = Math.round(timeDiff);
                if (seconds > this.delay) flag = true;
            } catch (e) {
                this.time = new Date();
                return {};
            }
        }
        if (!this.time || flag) {
            this.time = new Date();
            if (!this.cache) {
                await this._update();
            } else {
                this._update();
            }
            return this.cache;
        }
        return this.cache;
    }
    async _update() {
        const ret = await this.retriever();
        if (!ret) return;
        this.cache = ret;
    }
}