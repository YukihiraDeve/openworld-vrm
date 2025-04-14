import { Room, Client } from "colyseus";
import { MyRoomState, PlayerState } from "./schema/MyRoomState";

export class MyRoom extends Room<MyRoomState> {

    // Cette méthode est appelée une fois quand la room est créée.
    onCreate (options: any) {
        console.log("MyRoom created!");

        // Initialiser l'état de la room avec une nouvelle instance de notre schéma
        this.setState(new MyRoomState());

        // --- Gestion des messages des clients ---
        // Écouter les messages de type "updateState" envoyés par les clients
        this.onMessage("updateState", (client, message) => {
            const player = this.state.players.get(client.sessionId);

            if (player && message) {
                // Mettre à jour la position et la locomotion du joueur
                // S'assurer que message.position est bien un tableau de 3 nombres
                if (Array.isArray(message.position) && message.position.length === 3) {
                    // Remplacer les valeurs de l'ArraySchema existant
                    player.position.splice(0, 3, ...message.position);
                }

                // S'assurer que message.locomotion est une chaîne
                if (typeof message.locomotion === 'string') {
                    player.locomotion = message.locomotion;
                }

                // Si on ajoutait la rotation:
                // if (Array.isArray(message.rotation) && message.rotation.length === 4) {
                //     player.rotation.splice(0, 4, ...message.rotation);
                // }

                // Optionnel: Ajouter une validation/limitation des valeurs ici
                // console.log(`State updated for ${client.sessionId}: pos=${message.position}, loco=${message.locomotion}`);
            }
        });
    }

    // Cette méthode est appelée quand un client rejoint la room.
    onJoin (client: Client, options: any) {
        console.log(client.sessionId, "joined!");

        // Créer une nouvelle instance de PlayerState pour ce client
        const player = new PlayerState();

        // Initialiser la position (ex: près de l'origine) et la locomotion
        player.position.push(Math.random() * 2 - 1, 0, Math.random() * 2 - 1); // Position initiale aléatoire proche de 0,0,0
        player.locomotion = "idle";

        // Ajouter le joueur à la MapSchema 'players', en utilisant son sessionId comme clé
        this.state.players.set(client.sessionId, player);

        console.log(`Player ${client.sessionId} added at position:`, player.position.toArray());
        console.log(`Total players: ${this.state.players.size}`);
    }

    // Cette méthode est appelée quand un client quitte la room.
    async onLeave (client: Client, consented: boolean) {
        console.log(client.sessionId, "left!");

        // Supprimer le joueur de la MapSchema
        this.state.players.delete(client.sessionId);

        console.log(`Total players: ${this.state.players.size}`);
    }

    // Cette méthode est appelée quand la room est détruite.
    onDispose() {
        console.log("Room", this.roomId, "disposing...");
    }
} 