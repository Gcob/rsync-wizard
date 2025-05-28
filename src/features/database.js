import {fromData} from "./path.js";
import fs from "fs";

/**
 * Database class for managing JSON-based data storage
 */
export class DB {

    /**
     *
     * @param className {string}
     * @param table_name {string}
     * @param primary_key {string}
     * @param columns {string[]|null}
     */
    constructor(className, table_name, primary_key = 'id', columns = null) {
        this.className = className
        this.table_name = table_name;
        this.primary_key = primary_key;
        this.columns = columns;

        this.initJsonFile();
    }

    getJsonFilePath() {
        return fromData(`./${this.table_name}.json`);
    }

    initJsonFile() {
        if (!fs.existsSync(this.getJsonFilePath())) {
            fs.writeFileSync(this.getJsonFilePath(), JSON.stringify([]));
        }
    }

    getAllModels() {
        const data = fs.readFileSync(this.getJsonFilePath(), 'utf-8');
        const items = JSON.parse(data).items || [];

        if (items.length > 0 && items[0].hasOwnProperty('updated_at')) {
            items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        }

        return items;
    }

    /**
     * Save the current model instance to the JSON file
     */
    save(model) {
        const items = this.getAllModels();
        const existingModelIndex = items.findIndex(item => item[this.primary_key] === model[this.primary_key]);
        const data = {...model};

        if (this.columns) {
            for (const key in data) {
                if (!this.columns.includes(key)) {
                    delete data[key];
                }
            }
        }

        if (existingModelIndex !== -1) {
            items[existingModelIndex] = data;
        } else {
            items.push(data);
        }

        items.sort((a, b) => {
            if (a[this.primary_key] < b[this.primary_key]) {
                return -1;
            }
            if (a[this.primary_key] > b[this.primary_key]) {
                return 1;
            }
            return 0;
        })

        const tableData = {
            table_name: this.table_name,
            primary_key: this.primary_key,
            items: items,
        }

        const jsonData = JSON.stringify(tableData, null, 2);

        fs.writeFileSync(this.getJsonFilePath(), jsonData, 'utf-8');
    }

    /**
     * Delete the current model instance from the JSON file
     */
    delete(primaryKey) {
        const items = this.getAllModels();
        const updatedItems = items.filter(model => model[this.primary_key] !== primaryKey);

        const tableData = {
            meta: {
                table_name: this.table_name,
                primary_key: this.primary_key,
            },
            items: updatedItems,
        }

        const jsonData = JSON.stringify(tableData, null, 2);

        fs.writeFileSync(this.getJsonFilePath(), jsonData, 'utf-8');
    }

    /**
     * Find a model by its primary key
     * @param {string|number} primaryKey
     * @returns {object|null}
     */
    find(primaryKey) {
        const items = this.getAllModels();
        const foundModel = items.find(model => model[this.primary_key] === primaryKey);

        if (foundModel) {
            const modelInstance = new this.className();
            Object.assign(modelInstance, foundModel);
            return modelInstance;
        } else {
            return null;
        }
    }

    findBy(field, value) {
        const items = this.getAllModels();
        const foundModel = items.find(model => model[field] === value);

        if (foundModel) {
            const modelInstance = new this.className();
            Object.assign(modelInstance, foundModel);
            return modelInstance;
        } else {
            return null;
        }
    }
}