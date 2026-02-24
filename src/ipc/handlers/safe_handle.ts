import { ipcMain, IpcMainInvokeEvent } from "electron";
import log from "electron-log";
import { IS_TEST_BUILD } from "../utils/test_utils";

import { readSettings } from "../../main/settings";
import { HandlerContext } from "./base";

export function createLoggedHandler(_logger: log.LogFunctions) {
  return (
    channel: string,
    fn: (event: IpcMainInvokeEvent, input: any, context: HandlerContext) => Promise<any>,
  ) => {
    ipcMain.handle(
      channel,
      async (event: IpcMainInvokeEvent, rawInput: any) => {
        //logger.log(`IPC: ${ channel } called with args: ${ JSON.stringify(args) } `);
        try {
          const settings = readSettings();
          const context: HandlerContext = {
            userId: settings.userId,
            sessionToken: settings.sessionToken?.value,
          };
          const result = await fn(event, rawInput, context);
          // logger.log(
          //   `IPC: ${ channel } returned: ${ JSON.stringify(result)?.slice(0, 100) }...`,
          // );
          return result;
        } catch (error) {
          // logger.error(
          //   `Error in ${ fn.name }: args: ${ JSON.stringify(args) } `,
          //   error,
          // );
          throw new Error(`[${channel}] ${error} `);
        }
      },
    );
  };
}

export function createTestOnlyLoggedHandler(logger: log.LogFunctions) {
  if (!IS_TEST_BUILD) {
    // Returns a no-op function for non-e2e test builds.
    return () => { };
  }
  return createLoggedHandler(logger);
}
