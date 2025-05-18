import {JSONFilePreset} from "lowdb/node";

export const dbFile = `../../db.json`;
export const db = await JSONFilePreset(dbFile, {});

/**
 * Using lowdb to store ORMModel objects
 */
export default class ORMModel {
    constructor(tableName) {
        this.tableName = tableName;
        this.createdAt = new Date().toISOString();
        this.updatedAt = new Date().toISOString();

        if (!db.data[this.tableName]) {
            db.data[this.tableName] = [];
            db.write();
        }
    }

    async save() {
        this.updatedAt = new Date().toISOString();

        const index = db.data[this.tableName].findIndex(item => item.id === this.id);

        if (index !== -1) {
            db.data[this.tableName][index] = this.toJSON();
        } else {
            db.data[this.tableName].push(this.toJSON());
        }

        await db.write();
        return this;
    }

    async delete() {
        const index = db.data[this.tableName].findIndex(item => item.id === this.id);

        if (index !== -1) {
            db.data[this.tableName].splice(index, 1);
            await db.write();
            return true;
        }

        return false;
    }

    static findAll(tableName) {
        if (!db.data[tableName]) return [];

        return db.data[tableName].map(item => this.fromJSON(tableName, item));
    }
}