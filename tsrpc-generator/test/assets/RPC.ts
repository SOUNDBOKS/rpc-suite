


export enum Direction {
    UP,
    DOWN,
    LEFT,
    RIGHT,
}

export type Movement = {
    direction: Direction,
    magnitude: number,
}

export interface Entity {
    name: string,
}

export interface IRPCService {
    serviceID: string;

    getEntity(entityId: string): Entity | undefined
    getEntityIDs(): Promise<string[]>;
    moveEntity(entityId: string, movement: Movement): Promise<void>;
    optionalThing(thing?: string): any;
}