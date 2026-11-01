/** SDK223 useCCD and velocity are NOT pre-onLoad caches. Readbacks precede assertions. */
export function mountVisitor({app,scene,system,body,ccd,speed,staticVisitor,vector,record}) {
    app.run(scene);
    system.enable=true;
    body.useCCD=ccd;
    const actualCCD=body.useCCD;
    record({kind:'mounted-ccd-readback',expected:ccd,actual:actualCCD});
    if(actualCCD!==ccd) throw Error('CCD getter mismatch');
    if(!staticVisitor) body.setLinearVelocity(vector(speed,0,0));
    const actual=vector(0,0,0); body.getLinearVelocity(actual);
    record({kind:'mounted-velocity-readback',actual:{x:actual.x,y:actual.y,z:actual.z}});
    if(actual.x!==(staticVisitor ? 0 : speed) || actual.y!==0 || actual.z!==0) throw Error('Initial velocity getter mismatch');
    return actualCCD;
}
