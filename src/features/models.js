import {fromData} from "./path.js";
import fs from "fs";

export class Model {
    constructor(table_name, primary_key = 'id') {
        this.table_name = table_name;
        this.primary_key = primary_key;

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
        return JSON.parse(data);
    }

    save() {
        const dataToSave = {...this};
        delete dataToSave.table_name;
        delete dataToSave.primaryKey;
        const items = this.getAllModels();
        const existingModelIndex = items.findIndex(model => model[this.primary_key] === this[this.primary_key]);

        if (existingModelIndex !== -1) {
            items[existingModelIndex] = dataToSave;
        } else {
            items.push(dataToSave);
        }

        const tableData = {
            meta: {
                table_name: this.table_name,
                primary_key: this.primary_key,
            },
            items: items,
        }
        const tableDataStr = JSON.stringify(tableData, null, 2);

        fs.writeFileSync(this.getJsonFilePath(), tableDataStr, 'utf-8');
    }
}