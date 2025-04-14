import { Schema, MapSchema, type } from "@colyseus/schema";

// Définir la structure pour un joueur individuel
export class PlayerState extends Schema {
    // @type("number") x: number = 0;
    // @type("number") y: number = 0;
    // @type("number") z: number = 0;

    // Utiliser un ArraySchema pour la position pour correspondre à ce que le client envoie
    // (position.toArray() donne un tableau [x, y, z])
    @type(["number"]) position = new ArraySchema<number>(0, 0, 0);

    // Rotation (pour plus tard, peut-être un quaternion)
    // @type(["number"]) rotation = new ArraySchema<number>(0, 0, 0, 1); // x, y, z, w

    @type("string") locomotion: string = "idle";

    // On pourrait ajouter d'autres états ici (ex: nom du joueur, modèle VRM utilisé, etc.)
}

// Définir l'état global de la room
export class MyRoomState extends Schema {
    // Utiliser une MapSchema pour stocker les joueurs.
    // La clé sera le sessionId du client, la valeur sera un PlayerState.
    @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
} 