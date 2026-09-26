import { Component, input, Input } from 'cocosair';

export interface TickerRec {
    generation: number;
    variant: string;
    updates: number;
    clicks: number;
    onLoad: number;
    onEnable: number;
    start: number;
    onDisable: number;
    onDestroy: number;
}

export class Ticker extends Component {
    records: TickerRec[] = [];
    onToggle: (ticker: Ticker) => void = () => {};
    rec!: TickerRec;
    gen = 0;
    variant = 'A';

    onLoad(): void {
        this.rec = {
            generation: this.gen,
            variant: this.variant,
            updates: 0,
            clicks: 0,
            onLoad: 1,
            onEnable: 0,
            start: 0,
            onDisable: 0,
            onDestroy: 0,
        };
        this.records.push(this.rec);
    }

    onEnable(): void {
        this.rec.onEnable++;
        input.on(Input.EventType.TOUCH_START, this.onClick, this);
    }

    start(): void {
        this.rec.start++;
    }

    update(): void {
        this.rec.updates++;
    }

    onDisable(): void {
        this.rec.onDisable++;
        input.off(Input.EventType.TOUCH_START, this.onClick, this);
    }

    onDestroy(): void {
        this.rec.onDestroy++;
    }

    onClick(): void {
        this.onToggle(this);
    }
}
