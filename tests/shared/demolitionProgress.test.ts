import {describe,it,expect} from "vitest";
import {demolitionChallenge,parseDemolitionProgress,completeDemolition} from "../../shared/game/demolitionChallenges";
import {demolitionBlueprint} from "../../shared/game/demolitionBlueprint";
import {createVehiclePreset} from "../../shared/game/vehicleDesign";
describe("demolition progression and drawn machines",()=>{
 it("unlocks only the next legitimate stage and preserves bests",()=>{const initial=parseDemolitionProgress(null);const failed=completeDemolition(initial,0,1200,false);expect(failed.unlocked).toBe(0);const won=completeDemolition(failed,0,3300,true);expect(won.unlocked).toBe(1);expect(completeDemolition(won,0,2000,true).best[0]).toBe(3300);expect(completeDemolition(won,12,5000,true).unlocked).toBe(1);});
 it("validates persistence and generates increasingly reinforced puzzles",()=>{expect(parseDemolitionProgress("broken").unlocked).toBe(0);expect(parseDemolitionProgress('{"unlocked":-4,"best":{"0":-3,"1":2400}}')).toEqual({unlocked:0,best:{1:2400}});expect(demolitionChallenge(4).gate).toBe(true);expect(demolitionChallenge(60).reinforcement).toBeGreaterThan(demolitionChallenge(3).reinforcement);});
 it("changes physical hull mass and clearance with the drawing",()=>{const d=createVehiclePreset();const normal=demolitionBlueprint(d);d.strokes[0]!.points=d.strokes[0]!.points.map(p=>({x:p.x*.6,y:p.y*.6}));const small=demolitionBlueprint(d);expect(small.width).toBeLessThan(normal.width);expect(small.height).toBeLessThan(normal.height);expect(small.massFactor).toBeLessThan(normal.massFactor);});
 it("uses a safe chassis for degenerate doodles",()=>{const d=createVehiclePreset();d.strokes[0]!.points=[{x:0,y:0},{x:1,y:1}];expect(demolitionBlueprint(d).vertices).toHaveLength(4);});
});
