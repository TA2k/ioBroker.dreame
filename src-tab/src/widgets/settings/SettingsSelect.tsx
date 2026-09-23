/**
 * Drop-down lists for a widget's robot and floor, in place of the object browser.
 *
 * The object browser offers every object of the installation and leaves it to the user to know
 * that a robot is the device object under `dreame.<n>` and a floor the channel under `map.maps`.
 * These lists offer exactly the robots and floors there are, under the names the Dreame app gives
 * them.
 *
 * Host-neutral: each widget host wraps them in its own field type and hands in the words, since
 * each host translates its settings under its own prefix.
 */

import type React from "react";
import { useMemo } from "react";
import { MenuItem, TextField } from "@mui/material";

import { useStatesByPattern } from "../../connection/useStates";
import { useResolvedDevice, DEFAULT_INSTANCE } from "../../devices/useResolvedDevice";
import { useFloors } from "../../floors/useFloors";
import { DEVICE_LISTS_PATTERN, floorOptions, robotOptions, withStoredValue } from "./options";
import type { SelectOption } from "./options";
import type { TabConnection } from "../../connection/types";

interface CommonProps {
	connection: TabConnection;
	/** Stored object id, or empty. */
	value: string;
	onChange: (value: string) => void;
	/** Left out where the host labels the field itself, as vis-2 does. */
	label?: string;
	helperText?: string;
}

export interface RobotSelectProps extends CommonProps {
	/** The empty choice: leave the pick to the widget, which takes the first robot of `dreame.0`. */
	automaticLabel: string;
}

export function RobotSelect({ connection, automaticLabel, ...rest }: RobotSelectProps): React.JSX.Element {
	const values = useStatesByPattern(connection, DEVICE_LISTS_PATTERN);
	const options = useMemo(() => robotOptions(values), [values]);
	return <OptionSelect {...rest} options={options} emptyLabel={automaticLabel} />;
}

export interface FloorSelectProps extends CommonProps {
	/** The robot picked in the same settings - its floors are the ones offered. */
	device: string;
	/** The empty choice: show whichever floor the robot is on. */
	followLabel: string;
}

export function FloorSelect({ connection, device, followLabel, ...rest }: FloorSelectProps): React.JSX.Element {
	const resolved = useResolvedDevice(connection, device);
	const floors = useFloors(connection, resolved?.instanceId ?? DEFAULT_INSTANCE, resolved?.did ?? null);
	const options = useMemo(
		() => (resolved ? floorOptions(floors, resolved.instanceId, resolved.did) : []),
		[floors, resolved],
	);
	return <OptionSelect {...rest} options={options} emptyLabel={followLabel} />;
}

interface OptionSelectProps extends Omit<CommonProps, "connection"> {
	options: readonly SelectOption[];
	emptyLabel: string;
}

function OptionSelect({
	value,
	onChange,
	label,
	helperText,
	options,
	emptyLabel,
}: OptionSelectProps): React.JSX.Element {
	const shown = withStoredValue(options, value);

	return (
		<TextField
			select
			fullWidth
			variant="standard"
			label={label}
			helperText={helperText}
			value={value}
			onChange={event => onChange(event.target.value)}
			slotProps={{
				// The empty choice is a real one, with a text of its own; without these the field would
				// show a blank under a label sitting where the text belongs.
				select: { displayEmpty: true },
				inputLabel: { shrink: true },
			}}
		>
			<MenuItem value="">
				<em>{emptyLabel}</em>
			</MenuItem>
			{shown.map(option => (
				<MenuItem key={option.value} value={option.value}>
					{option.label}
				</MenuItem>
			))}
		</TextField>
	);
}
