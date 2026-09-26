import { Component } from 'cocosair';

/** Per-node behavior; enabled/disabled and destroyed by the scene lifecycle. */
export class Rotator extends Component {
    speed = 45;

    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * this.speed, 0);
    }
}
