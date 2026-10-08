import {test,expect}from "@playwright/test";
test("two players race independent machines and can rematch",async({page})=>{
 test.setTimeout(60000);const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/?mode=duel",{waitUntil:"domcontentloaded"});
 const start=page.locator("#duelStart");await expect(start).toBeEnabled({timeout:15000});
 const p1=page.frames().find(f=>f.url().includes("lane=1"))!,p2=page.frames().find(f=>f.url().includes("lane=2"))!;
 const read=(frame:typeof p1)=>frame.evaluate(()=>JSON.parse((window as unknown as {render_game_to_text:()=>string}).render_game_to_text()));
 expect((await read(p1)).time).toBe(60);expect((await read(p2)).time).toBe(60);await start.click();
 await p2.locator("canvas.demolition-canvas").click({position:{x:100,y:150}});
 const x=(await read(p2)).vehicle.x;await page.keyboard.down("ArrowRight");await page.waitForTimeout(700);await page.keyboard.up("ArrowRight");expect((await read(p2)).vehicle.x).toBeGreaterThan(x+20);
 await page.keyboard.down("d");
 for(let i=0;i<15;i++){await page.keyboard.down("j");await page.waitForTimeout(650);await page.keyboard.up("j");if((await read(p1)).completed)break;if(i%2===0)await page.keyboard.press("Space");await page.waitForTimeout(150);}
 await page.keyboard.up("d");await expect(page.locator("#duelStatus")).toContainText("TEAL wins",{timeout:5000});
 await start.click();await expect(page.locator("#duelStatus")).toContainText("GO!");await page.waitForTimeout(500);expect((await read(p1)).targets).toBe(0);expect((await read(p2)).targets).toBe(0);expect((await read(p1)).completed).toBe(false);await expect(start).toBeDisabled();expect(errors).toEqual([]);
});
