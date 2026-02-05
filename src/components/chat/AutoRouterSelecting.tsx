import { Bot } from "lucide-react";
import { motion } from "framer-motion";

export function AutoRouterSelecting() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 my-2 max-w-3xl mx-auto bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      <Bot
        size={18}
        className="text-blue-600 dark:text-blue-400 flex-shrink-0"
      />
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
          Seleccionando el mejor modelo
        </span>
        <div className="flex items-center space-x-1">
          <motion.div
            className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400"
            animate={{ y: [0, -8, 0] }}
            transition={{
              repeat: Number.POSITIVE_INFINITY,
              duration: 0.6,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400"
            animate={{ y: [0, -8, 0] }}
            transition={{
              repeat: Number.POSITIVE_INFINITY,
              duration: 0.6,
              ease: "easeInOut",
              delay: 0.2,
            }}
          />
          <motion.div
            className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400"
            animate={{ y: [0, -8, 0] }}
            transition={{
              repeat: Number.POSITIVE_INFINITY,
              duration: 0.6,
              ease: "easeInOut",
              delay: 0.4,
            }}
          />
        </div>
      </div>
    </div>
  );
}
