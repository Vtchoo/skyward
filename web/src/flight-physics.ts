import * as THREE from 'three';
import { DesertSurface, PLANET_RADIUS } from './planet';
import type { ShipId } from './ships';

export interface FlightInput {
  pitch: number; roll: number; yaw: number; throttle: number; vertical: number; boost: boolean; brake: boolean;
}
export const neutralInput = (): FlightInput => ({ pitch:0,roll:0,yaw:0,throttle:0,vertical:0,boost:false,brake:false });
const tuning: Record<ShipId,{speed:number;turn:number;acceleration:number}> = {
  poco:{speed:300,turn:1.3,acceleration:48}, largo:{speed:230,turn:0.95,acceleration:35},
  scout:{speed:365,turn:1.65,acceleration:60}, 'm-bot':{speed:350,turn:1.5,acceleration:58},
};
const forwardAxis = new THREE.Vector3(0,0,-1);

/** SI units, radial inverse-square gravity, and arcade attitude/velocity assists.
 * The ring cancels gravity independently of attitude and permits zero-speed flight. */
export class FlightPhysics {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly orientation = new THREE.Quaternion();
  private readonly rates = new THREE.Vector3();
  throttle = 0;
  ringEnabled = true;
  grounded = false;
  impactSpeed = 0;
  constructor(readonly surface: DesertSurface, readonly ship: ShipId) { this.reset(); }
  reset() {
    this.position.set(0,PLANET_RADIUS+this.surface.height(new THREE.Vector3(0,1,0))+180,0);
    this.velocity.set(0,0,0); this.orientation.identity(); this.rates.set(0,0,0);
    this.throttle=0; this.ringEnabled=true; this.grounded=false; this.impactSpeed=0;
  }
  get altitude() { return this.position.length()-PLANET_RADIUS-this.surface.height(this.position); }
  get speed() { return this.velocity.length(); }
  get verticalSpeed() { return this.velocity.dot(this.position.clone().normalize()); }
  step(dt: number, input: FlightInput) {
    const spec=tuning[this.ship], up=this.position.clone().normalize();
    const oldUp=up.clone();
    this.throttle=THREE.MathUtils.clamp(this.throttle+input.throttle*dt*0.3,0,1);
    if(input.brake) this.throttle=Math.max(0,this.throttle-dt*0.65);
    const targetRates=new THREE.Vector3(input.pitch*spec.turn,input.yaw*spec.turn*0.65,input.roll*spec.turn*1.8);
    this.rates.lerp(targetRates,1-Math.exp(-dt*7));
    const angle=this.rates.length()*dt;
    if(angle>0) this.orientation.multiply(new THREE.Quaternion().setFromAxisAngle(this.rates.clone().normalize(),angle));
    // A banked airframe carves a coordinated turn without requiring rudder input.
    const shipRight=new THREE.Vector3(1,0,0).applyQuaternion(this.orientation);
    const bank=shipRight.dot(up);
    const turn=bank*Math.min(1,this.speed/90)*0.55;
    this.orientation.premultiply(new THREE.Quaternion().setFromAxisAngle(up,turn*dt)).normalize();
    const forward=forwardAxis.clone().applyQuaternion(this.orientation);
    const desiredSpeed=this.throttle*spec.speed*(input.boost ? 1.5 : 1);
    const along=this.velocity.dot(forward);
    const acceleration=forward.clone().multiplyScalar(THREE.MathUtils.clamp((desiredSpeed-along)*1.2,-spec.acceleration*1.8,spec.acceleration*(input.boost ? 1.7 : 1)));
    const lateral=this.velocity.clone().addScaledVector(forward,-along);
    acceleration.addScaledVector(lateral,-(0.05+Math.min(this.speed,350)*0.006));
    const gravity=this.surface.gravity(this.position.length());
    acceleration.addScaledVector(up,-gravity);
    if(this.ringEnabled) {
      acceleration.addScaledVector(up,gravity);
      const desiredClimb=forward.dot(up)*desiredSpeed+input.vertical*32;
      // Cancel the radial component of the other assists, then control climb.
      acceleration.addScaledVector(up,-acceleration.dot(up));
      acceleration.addScaledVector(up,THREE.MathUtils.clamp((desiredClimb-this.velocity.dot(up))*3,-45,45));
      const tangentialSpeedSq=this.velocity.lengthSq()-this.velocity.dot(up)**2;
      acceleration.addScaledVector(up,-tangentialSpeedSq/this.position.length());
    } else {
      const lift=new THREE.Vector3(0,1,0).applyQuaternion(this.orientation);
      acceleration.addScaledVector(lift,gravity*Math.min(1.08,(Math.max(0,along)/90)**2));
    }
    if(input.brake) acceleration.addScaledVector(this.velocity,-1.3);
    this.velocity.addScaledVector(acceleration,dt); this.position.addScaledVector(this.velocity,dt);
    // Follow the spherical horizon as the ship travels around the globe.
    const newUp=this.position.clone().normalize();
    this.orientation.premultiply(new THREE.Quaternion().setFromUnitVectors(oldUp,newUp)).normalize();
    const terrainRadius=PLANET_RADIUS+this.surface.height(this.position)+3.8;
    this.grounded=this.position.length()<terrainRadius;
    if(this.grounded) {
      const normal=this.surface.normal(this.position);
      const inward=this.velocity.dot(normal);
      if(inward<0) { this.impactSpeed=-inward; this.velocity.addScaledVector(normal,-inward); }
      this.position.setLength(terrainRadius);
      this.velocity.multiplyScalar(Math.exp(-dt*2.5));
    } else this.impactSpeed=0;
  }
}
