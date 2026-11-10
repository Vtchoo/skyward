import { test, expect } from '@playwright/test';

test('ship geometry matches reference proportions and renders comparison sheets', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1180 });
  await page.goto('/');
  const plans = [
    { id: 'poco', cy: 135, file: 'ddf-ships.jpeg', top: [0,60,250,150], side: [0,220,250,55], front: [265,235,150,50], frontScale: 1, length: 14, span: 9.2 },
    { id: 'largo', cy: 389, file: 'ddf-ships.jpeg', top: [0,314,280,150], side: [0,470,280,55], front: [270,477,140,45], frontScale: 1, length: 16.3, span: 9.2 },
    { id: 'scout', cy: 637, file: 'ddf-ships.jpeg', top: [0,567,260,140], side: [0,707,260,44], front: [270,711,145,40], frontScale: 1, length: 15.2, span: 8.7 },
    { id: 'm-bot', cy: 163, file: 'm-bot.jpeg', top: [0,75,220,176], side: [0,280,220,65], front: [235,282,260,65], frontScale: 1.5, length: 11.6, span: 10.6 },
  ];
  for (const plan of plans) {
    const metrics = await page.evaluate(async (plan) => {
      const modulePath = '/src/ships.ts';
      const geometrySource = await (await fetch('/src/ship-geometry.ts')).text();
      const threePath = geometrySource.match(/from\s+["']([^"']+)["']/)![1];
      const { createShip } = await import(modulePath);
      const THREE = await import(threePath);
      document.body.innerHTML = `<style>body{margin:0;padding:24px;background:#e9edef;color:#24343e;font:13px Arial}h1{font-size:23px;margin:0 0 8px}p{margin:0 0 20px;color:#54636c}.row{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:0 0 16px}.card{background:white;padding:12px;min-width:0}.card label{display:block;font-size:10px;letter-spacing:2px;margin:0 0 6px}.card canvas,.card img{display:block;width:100%;height:265px;object-fit:contain}</style><h1>${plan.id.toUpperCase()} / reference comparison</h1><p>Original drawing on the left. Orthographic 3D reconstruction on the right. Colors are neutral; the source drawings do not specify a livery.</p><div id="sheets"></div>`;
      const model = createShip(plan.id);
      const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf7f8f8); scene.add(model);
      scene.add(new THREE.HemisphereLight(0xffffff,0x818b93,2.4));
      const light = new THREE.DirectionalLight(0xffffff,2.5); light.position.set(10,20,-10); scene.add(light);
      const renderer = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
      renderer.setSize(1360,530); renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const reference = new Image(); reference.src = `/references/${plan.file}`; await reference.decode();
      const origin = model.userData.planOrigin;
      for (const name of ['top','side','front'] as const) {
        const crop = plan[name];
        const row = document.createElement('div'); row.className='row';
        const left = document.createElement('div'); left.className='card'; left.innerHTML=`<label>${name.toUpperCase()} / SOURCE</label>`;
        const source = document.createElement('canvas'); source.width=1360; source.height=530;
        const ctx=source.getContext('2d')!; ctx.fillStyle='white'; ctx.fillRect(0,0,1360,530);
        const ratio = Math.min(1360/crop[2],530/crop[3]);
        ctx.drawImage(reference,crop[0],crop[1],crop[2],crop[3],(1360-crop[2]*ratio)/2,(530-crop[3]*ratio)/2,crop[2]*ratio,crop[3]*ratio);
        left.append(source); row.append(left);
        const right = document.createElement('div'); right.className='card'; right.innerHTML=`<label>${name.toUpperCase()} / MODEL</label>`;
        const viewScale = name === 'front' ? plan.frontScale : 1;
        const halfW = Math.max(crop[2],crop[3]*1360/530)*0.065/2/viewScale;
        const halfH = halfW*530/1360;
        const camera = new THREE.OrthographicCamera(-halfW,halfW,halfH,-halfH,0.1,150);
        const target = name === 'front' ? new THREE.Vector3(0,0,0) : new THREE.Vector3(0,0,(origin-crop[2]/2)*0.065);
        if(name==='top'){camera.up.set(-1,0,0);camera.position.copy(target).add(new THREE.Vector3(0,40,0));}
        else if(name==='side') camera.position.copy(target).add(new THREE.Vector3(40,0,0));
        else camera.position.set(0,0,-40);
        camera.lookAt(target); renderer.render(scene,camera);
        const image=new Image(); image.src=renderer.domElement.toDataURL(); await image.decode(); right.append(image); row.append(right);
        document.querySelector('#sheets')!.append(row);
      }
      const emitter=model.getObjectByName('acclivity/emitter');
      if (emitter) {
        const target=emitter.position.clone();
        const camera=new THREE.OrthographicCamera(-4,4,4*530/1360,-4*530/1360,0.1,150);
        camera.position.copy(target).add(new THREE.Vector3(4,-6,-5)); camera.lookAt(target);
        renderer.render(scene,camera);
        const card=document.createElement('div'); card.className='card';
        card.innerHTML='<label>UNDERSIDE / ACCLIVITY RING DETAIL</label>';
        const image=new Image(); image.src=renderer.domElement.toDataURL(); await image.decode(); card.append(image);
        document.querySelector('#sheets')!.append(card);
      }
      let finite=true;
      model.traverse((object: any)=>{if(object.isMesh){const positions=object.geometry.getAttribute('position'); for(let i=0;i<positions.array.length;i++) if(!Number.isFinite(positions.array[i])) finite=false;}});
      renderer.dispose(); renderer.forceContextLoss();
      return {length:size.z,span:size.x,height:size.y,finite};
    }, plan);
    expect(metrics.finite).toBe(true);
    expect(metrics.length).toBeGreaterThan(plan.length-0.8);
    expect(metrics.length).toBeLessThan(plan.length+0.8);
    expect(metrics.span).toBeGreaterThan(plan.span-0.8);
    expect(metrics.span).toBeLessThan(plan.span+0.8);
    expect(metrics.height).toBeGreaterThan(1);
    await page.screenshot({path:testInfo.outputPath(`${plan.id}-comparison.png`),fullPage:true});
    await testInfo.attach(`${plan.id}-dimensions`, {body:JSON.stringify(metrics,null,2),contentType:'application/json'});
  }
});
