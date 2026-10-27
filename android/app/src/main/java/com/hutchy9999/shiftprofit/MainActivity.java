package com.hutchy9999.shiftprofit;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state){
        registerPlugin(ShiftTrackerPlugin.class);
        super.onCreate(state);
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content),(view,insets)->{
            Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;
        });
    }
}
