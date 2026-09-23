import { describe, expect, it } from "vitest";
import { floorOptions, robotOptions, withStoredValue } from "./options";
import { parseDeviceObjectId, parseFloorObjectId } from "../../devices/deviceRef";
import { remoteEntryUrl } from "../remoteEntry";

const list = (...devices: Array<{ did: string; name?: string }>): string =>
	JSON.stringify(devices.map(device => ({ typ: "vacuum", name: "", ...device })));

describe("robotOptions", () => {
	it("lists the robots of one instance by name, without naming the instance", () => {
		const options = robotOptions({
			"dreame.0.info.devices": list({ did: "b", name: "Upstairs" }, { did: "a", name: "Kitchen" }),
		});
		expect(options).toEqual([
			{ value: "dreame.0.a", label: "Kitchen" },
			{ value: "dreame.0.b", label: "Upstairs" },
		]);
	});

	it("names the instance once there is more than one, and orders instances by number", () => {
		const options = robotOptions({
			"dreame.10.info.devices": list({ did: "c", name: "Garage" }),
			"dreame.2.info.devices": list({ did: "a", name: "Kitchen" }),
		});
		expect(options.map(option => option.label)).toEqual(["Kitchen (dreame.2)", "Garage (dreame.10)"]);
	});

	it("falls back to the device id where the robot has no name", () => {
		expect(robotOptions({ "dreame.0.info.devices": list({ did: "abc" }) })).toEqual([
			{ value: "dreame.0.abc", label: "abc" },
		]);
	});

	it("ignores states that are not a device list, and lists that do not parse", () => {
		expect(
			robotOptions({
				"dreame.0.info.devicesOld": list({ did: "x" }),
				"dreame.1.info.devices": "not json",
			}),
		).toEqual([]);
	});

	it("produces values the widgets read back as the same robot", () => {
		const [option] = robotOptions({ "dreame.3.info.devices": list({ did: "abc123", name: "Kitchen" }) });
		expect(parseDeviceObjectId(option!.value)).toEqual({ instanceId: "dreame.3", did: "abc123" });
	});
});

describe("floorOptions", () => {
	it("offers each floor under its name, as the channel id the widgets read back", () => {
		const options = floorOptions(
			[
				{ id: "1", name: "Ground floor" },
				{ id: "2", name: "Upstairs" },
			],
			"dreame.0",
			"abc",
		);
		expect(options).toEqual([
			{ value: "dreame.0.abc.map.maps.1", label: "Ground floor" },
			{ value: "dreame.0.abc.map.maps.2", label: "Upstairs" },
		]);
		expect(options.map(option => parseFloorObjectId(option.value))).toEqual(["1", "2"]);
	});
});

describe("withStoredValue", () => {
	const options = [{ value: "dreame.0.a", label: "Kitchen" }];

	it("leaves the list alone when the value is in it, or when nothing is stored", () => {
		expect(withStoredValue(options, "dreame.0.a")).toEqual(options);
		expect(withStoredValue(options, "")).toEqual(options);
	});

	it("keeps a stored value that is not in the list visible under its id", () => {
		expect(withStoredValue(options, "dreame.0.gone")).toEqual([
			...options,
			{ value: "dreame.0.gone", label: "dreame.0.gone" },
		]);
	});
});

describe("remoteEntryUrl", () => {
	it("finds the entry next to the assets directory, inside the admin", () => {
		expect(
			remoteEntryUrl("http://host:8081/adapter/dreame/dm-widgets/assets/Components-abc.js", "customDevices.js"),
		).toBe("http://host:8081/adapter/dreame/dm-widgets/customDevices.js");
	});

	it("finds it the same way when the web adapter serves the bundle", () => {
		expect(remoteEntryUrl("https://host:8082/dreame.admin/dm-widgets/assets/x.js", "customDevices.js")).toBe(
			"https://host:8082/dreame.admin/dm-widgets/customDevices.js",
		);
	});

	it("takes the module's own directory where there is no assets directory", () => {
		expect(remoteEntryUrl("http://localhost:5173/src/DreameRobotComponent.tsx", "customDevices.js")).toBe(
			"http://localhost:5173/src/customDevices.js",
		);
	});
});
