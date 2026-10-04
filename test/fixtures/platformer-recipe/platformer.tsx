<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.4" tiledversion="1.4" name="platformer" tilewidth="16" tileheight="16" tilecount="2" columns="2" margin="0" spacing="0">
  <image source="tiles.png" width="32" height="16"/>
  <tile id="0">
    <properties>
      <property name="kind" value="stone"/>
      <property name="solid" type="bool" value="true"/>
      <property name="friction" type="float" value="0.2"/>
    </properties>
  </tile>
  <tile id="1">
    <properties>
      <property name="kind" value="plank"/>
      <property name="oneway" type="bool" value="true"/>
      <property name="solid" type="bool" value="true"/>
    </properties>
  </tile>
</tileset>
