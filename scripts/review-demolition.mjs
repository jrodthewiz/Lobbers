// Repeatable visual proof and real-input checks. No production state is changed.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const url=process.env.LOBBERS_REVIEW_URL??'http://localhost:5183/';
const out=path.resolve(process.env.LOBBERS_REVIEW_OUTPUT??`artifacts/demolition-review/${new Date().toISOString().replaceAll(':','-')}`);
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true, ...(process.env.LOBBERS_BROWSER_PATH?{executablePath:process.env.LOBBERS_BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:900}});
await context.tracing.start({screenshots:true,snapshots:true});
const errors=[],checks=[],captures=[];
context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
const read=frame=>frame.evaluate(()=>JSON.parse(window.render_game_to_text()));
async function shot(page,name){await page.screenshot({path:path.join(out,`${name}.png`),timeout:15000});captures.push(name);}
async function wait(page){await page.waitForFunction(()=>typeof window.render_game_to_text==='function');}
try{
 const solo=await context.newPage();await solo.goto(url,{waitUntil:'domcontentloaded'});await wait(solo);
 assert.equal((await read(solo)).targets,0);await shot(solo,'solo-desktop');
 await solo.locator('#openGarageButton').click();const time=(await read(solo)).time;
 await solo.waitForTimeout(500);assert.equal((await read(solo)).time,time);await solo.locator('#garagePhysics').waitFor();
 assert.match(await solo.locator('#garagePhysics').innerText(),/Build \d+\/100/);await shot(solo,'garage-desktop');
 const canvasBox=await solo.locator('#vehicleDrawingCanvas').boundingBox();assert.ok(Math.abs(canvasBox.width/canvasBox.height-880/520)<.03,'Desktop blueprint must retain its physical proportions');checks.push('desktop blueprint aspect ratio matches drawing coordinates');
 await solo.setViewportSize({width:390,height:844});await shot(solo,'garage-phone');await solo.getByRole('button',{name:'Close garage'}).click();await shot(solo,'solo-phone');
 checks.push('solo desktop/phone, garage stats and paused timer');await solo.close();
 const duel=await context.newPage();await duel.goto(new URL('?mode=duel',url).href,{waitUntil:'domcontentloaded'});await duel.locator('#duelStart:not(:disabled)').waitFor();await shot(duel,'duel-desktop-building');
 const lanes=[1,2].map(n=>duel.frames().find(f=>f.url().includes(`lane=${n}`)));assert.ok(lanes.every(Boolean));
 await duel.locator('#duelStart').click();await duel.locator('#duelPause').click();await duel.waitForTimeout(200);
 const paused=await Promise.all(lanes.map(read));await duel.waitForTimeout(500);const still=await Promise.all(lanes.map(read));assert.deepEqual(still.map(s=>s.time),paused.map(s=>s.time));
 await shot(duel,'duel-paused');await duel.locator('#duelPause').click();
 // Shift actually yields uppercase DOM key values. Both input and release must normalize.
 const tealX=(await read(lanes[0])).vehicle.x;
 await duel.keyboard.down('Shift');await duel.keyboard.down('D');await duel.keyboard.down('J');await duel.waitForTimeout(350);
 assert.ok((await read(lanes[0])).vehicle.x>tealX+15,'Shift+D must drive');assert.ok((await read(lanes[0])).charge>.1,'Shift+J must charge');
 await duel.keyboard.up('D');await duel.keyboard.up('J');await duel.keyboard.up('Shift');
 const before=(await read(lanes[1])).vehicle.x;await lanes[0].locator('canvas.demolition-canvas').click({position:{x:110,y:150}});await duel.keyboard.down('ArrowRight');await duel.waitForTimeout(500);await duel.keyboard.up('ArrowRight');assert.ok((await read(lanes[1])).vehicle.x>before+15);checks.push('both clocks pause, Shift chord, child-focused Coral input');
 await duel.keyboard.down('d');
 for(let i=0;i<20;i++){await duel.keyboard.down('j');await duel.waitForTimeout(650);await duel.keyboard.up('j');if((await read(lanes[0])).completed)break;if(i%2===0)await duel.keyboard.press('Space');await duel.waitForTimeout(150);}
 await duel.keyboard.up('d');await duel.waitForFunction(()=>document.querySelector('#hud-root').dataset.phase==='finished',{},{timeout:5000});assert.match(await duel.locator('#duelStatus').innerText(),/TEAL wins/);await shot(duel,'duel-victory');
 assert.equal(await duel.locator('#duelStart').innerText(),'Rebuild / rematch →');await duel.waitForTimeout(200);assert.equal(await duel.locator('#duelStart').innerText(),'Rebuild / rematch →');
 await duel.locator('#duelStart').click();await duel.waitForTimeout(500);assert.equal((await read(lanes[0])).targets,0);assert.equal((await read(lanes[1])).targets,0);assert.equal(await duel.locator('#hud-root').getAttribute('data-phase'),'racing');checks.push('actual race victory, stable result, clean rematch');
 await duel.locator('#duelPause').click();await duel.setViewportSize({width:390,height:844});await shot(duel,'duel-phone');assert.ok(await duel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await duel.close();
 assert.deepEqual(errors,[]);checks.push('no browser exceptions or phone overflow');
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({status:'passed',checks,captures,errors,url},null,2));
 console.log(JSON.stringify({status:'passed',out,checks,captures},null,2));
}catch(error){await fs.writeFile(path.join(out,'report.json'),JSON.stringify({status:'failed',checks,captures,errors,error:String(error)},null,2));throw error;}
finally{await context.tracing.stop({path:path.join(out,'trace.zip')});await browser.close();}
