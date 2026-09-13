package com.rustorepush

import android.content.Context
import ru.rustore.sdk.pushclient.common.logger.DefaultLogger
import ru.rustore.sdk.pushclient.common.logger.Logger
import ru.rustore.sdk.pushclient.provider.AbstractRuStorePushClientParams

class RuStorePushClientParams(context: Context) : AbstractRuStorePushClientParams(context) {

  override fun getLogger(): Logger = DefaultLogger("ReactRuStorePushClient")

  override fun getTestModeEnabled(): Boolean = false
}
