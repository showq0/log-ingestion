import { validateLogs } from "../utils.js"
import { Request, Response } from "express"

import { enqueueLogs } from "../db/ingestion/buffer.js"

export async function createLogsHandler(req: Request, res: Response) {
    const body = req.body;
    //validate
    const result = validateLogs(body.logs);

    if (result.valid.length === 0) {
        return res.status(400).json({
            accepted: 0,
            rejected: result.invalid,
        });
    }
    // return promise we don't wait the promise 
    await enqueueLogs(result.valid);

    return res.status(200).json({
        accepted: result.valid.length,
        rejected: result.invalid
    });
}
