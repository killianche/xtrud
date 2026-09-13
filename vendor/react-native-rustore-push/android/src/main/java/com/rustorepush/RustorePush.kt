package com.rustorepush

import android.app.Application
import ru.rustore.sdk.pushclient.RuStorePushClient

object RustorePush {

  fun init(application: Application, projectId: String) {
    RuStorePushClient.init(application = application, projectId = projectId)
  }
}
