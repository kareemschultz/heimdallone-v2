import {
	closestCorners,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { type ReactNode, useState } from "react";

export interface KanbanColumn {
	hint?: string;
	key: string;
	label: string;
}

export interface KanbanBoardProps<TCard> {
	canMove?: (
		card: TCard,
		fromColumn: string,
		toColumn: string
	) => { allowed: boolean; reason?: string };
	cards: TCard[];
	columns: KanbanColumn[];
	emptyColumnHint?: string;
	getCardColumn: (card: TCard) => string;
	getCardKey: (card: TCard) => string;
	onMove: (
		cardKey: string,
		fromColumn: string,
		toColumn: string
	) => void | Promise<void>;
	/**
	 * Called when an async `onMove` rejects. When omitted, the rejection is
	 * caught (so it never becomes an unhandled rejection) but otherwise left
	 * to the caller's own mutation error handling. Provide this when a
	 * consumer does NOT surface move failures through another channel.
	 */
	onMoveError?: (
		error: unknown,
		context: { cardKey: string; fromColumn: string; toColumn: string }
	) => void;
	renderCard: (card: TCard, isDragging: boolean) => ReactNode;
}

export function KanbanBoard<TCard>({
	columns,
	cards,
	getCardKey,
	getCardColumn,
	renderCard,
	onMove,
	onMoveError,
	canMove,
	emptyColumnHint = "Empty",
}: KanbanBoardProps<TCard>) {
	const [activeCardKey, setActiveCardKey] = useState<string | null>(null);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
	);

	const cardsByColumn = new Map<string, TCard[]>();
	for (const col of columns) {
		cardsByColumn.set(col.key, []);
	}
	for (const card of cards) {
		const colKey = getCardColumn(card);
		const bucket = cardsByColumn.get(colKey);
		if (bucket) {
			bucket.push(card);
		}
	}

	const activeCard =
		activeCardKey === null
			? null
			: (cards.find((c) => getCardKey(c) === activeCardKey) ?? null);

	const handleDragStart = (e: DragStartEvent) => {
		setActiveCardKey(String(e.active.id));
	};

	const handleDragEnd = (e: DragEndEvent) => {
		setActiveCardKey(null);
		if (!e.over) {
			return;
		}
		const cardKey = String(e.active.id);
		const toColumn = String(e.over.id);
		const card = cards.find((c) => getCardKey(c) === cardKey);
		if (!card) {
			return;
		}
		const fromColumn = getCardColumn(card);
		if (fromColumn === toColumn) {
			return;
		}
		if (canMove) {
			const verdict = canMove(card, fromColumn, toColumn);
			if (!verdict.allowed) {
				return;
			}
		}
		const result = onMove(cardKey, fromColumn, toColumn);
		if (result && typeof result.catch === "function") {
			result.catch((error: unknown) => {
				if (onMoveError) {
					onMoveError(error, { cardKey, fromColumn, toColumn });
				}
				// Without onMoveError we still swallow here so a rejection never
				// becomes an unhandled promise rejection — callers that don't
				// pass onMoveError are expected to surface failures via their
				// own mutation onError handler (as the Pipeline page does).
			});
		}
	};

	return (
		<DndContext
			collisionDetection={closestCorners}
			onDragEnd={handleDragEnd}
			onDragStart={handleDragStart}
			sensors={sensors}
		>
			<div className="kanban-board">
				{columns.map((col) => {
					const colCards = cardsByColumn.get(col.key) ?? [];
					return (
						<KanbanColumnDroppable
							cardCount={colCards.length}
							column={col}
							emptyHint={emptyColumnHint}
							key={col.key}
						>
							{colCards.map((card) => {
								const key = getCardKey(card);
								return (
									<KanbanCardDraggable cardKey={key} key={key}>
										{(isDragging) => renderCard(card, isDragging)}
									</KanbanCardDraggable>
								);
							})}
						</KanbanColumnDroppable>
					);
				})}
			</div>
			<DragOverlay>
				{activeCard ? (
					<div className="kanban-drag-overlay">
						{renderCard(activeCard, true)}
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}

interface KanbanColumnDroppableProps {
	cardCount: number;
	children: ReactNode;
	column: KanbanColumn;
	emptyHint: string;
}

function KanbanColumnDroppable({
	column,
	cardCount,
	emptyHint,
	children,
}: KanbanColumnDroppableProps) {
	const { setNodeRef, isOver } = useDroppable({ id: column.key });
	return (
		<div
			className={`kanban-col ${isOver ? "kanban-col-over" : ""}`}
			ref={setNodeRef}
		>
			<div className="kanban-col-head">
				<span className="kanban-col-title">{column.label}</span>
				<span className="kanban-col-count">{cardCount}</span>
			</div>
			{column.hint && <div className="kanban-col-hint">{column.hint}</div>}
			<div className="kanban-col-body">
				{cardCount === 0 ? (
					<div className="kanban-col-empty">{emptyHint}</div>
				) : (
					children
				)}
			</div>
		</div>
	);
}

interface KanbanCardDraggableProps {
	cardKey: string;
	children: (isDragging: boolean) => ReactNode;
}

function KanbanCardDraggable({ cardKey, children }: KanbanCardDraggableProps) {
	const { setNodeRef, listeners, attributes, transform, isDragging } =
		useDraggable({ id: cardKey });
	const style = transform
		? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
		: undefined;
	return (
		<div
			{...listeners}
			{...attributes}
			className={`kanban-card-wrap ${isDragging ? "kanban-card-dragging" : ""}`}
			ref={setNodeRef}
			style={style}
		>
			{children(isDragging)}
		</div>
	);
}
