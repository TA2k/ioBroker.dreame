/**
 * The settings of one robot, live, and the means to change them.
 *
 * A change is shown at once and written to `config.widget`; when the state comes back - or is
 * changed elsewhere, in a second browser - that value takes over. A link's `?cfg=` delta is laid
 * over what is stored, without being stored itself until the user changes something, as in the
 * widget.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStates } from "../connection/useStates";
import { applyDelta, defaultWidgetConfig, parseWidgetConfig } from "./widgetConfig";
import type { ConfigDelta, WidgetConfig } from "./widgetConfig";
import type { TabConnection } from "../connection/types";

export interface WidgetConfigHandle {
	config: WidgetConfig;
	update: (change: (config: WidgetConfig) => WidgetConfig) => void;
	reset: () => void;
}

export function useWidgetConfig(
	connection: TabConnection,
	instanceId: string,
	did: string,
	delta?: ConfigDelta | null,
): WidgetConfigHandle {
	const stateId = `${instanceId}.${did}.config.widget`;
	const values = useStates(connection, [stateId]);
	const raw = values[stateId];
	const stored = useMemo(() => parseWidgetConfig(raw), [raw]);

	// What the user just set, until the state catches up.
	const [pending, setPending] = useState<WidgetConfig | null>(null);
	useEffect(() => setPending(null), [raw]);

	const base = pending ?? stored;
	const config = useMemo(() => (delta ? applyDelta(base, delta) : base), [base, delta]);

	const write = useCallback(
		(next: WidgetConfig): void => {
			setPending(next);
			void connection.setState(stateId, JSON.stringify(next)).catch(() => undefined);
		},
		[connection, stateId],
	);

	const update = useCallback(
		(change: (config: WidgetConfig) => WidgetConfig): void => write(change(config)),
		[config, write],
	);

	const reset = useCallback((): void => write(defaultWidgetConfig()), [write]);

	return { config, update, reset };
}
